package com.bubit.common.config;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.read.ListAppender;
import com.bubit.common.security.JwtProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.messaging.simp.broker.SimpleBrokerMessageHandler;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.lang.reflect.Type;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

import static org.junit.jupiter.api.Assertions.*;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WebSocketAuthenticationIntegrationTest {

    private static final String SECRET = "test-only-jwt-secret-0123456789abcdef0123456789";

    @LocalServerPort
    int port;

    @Autowired
    JwtProvider jwtProvider;

    @Autowired
    SimpleBrokerMessageHandler broker;

    private WebSocketStompClient client;
    private Logger rootLogger;
    private ListAppender<ILoggingEvent> logs;

    @BeforeEach
    void setUp() {
        client = new WebSocketStompClient(new StandardWebSocketClient());
        rootLogger = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        logs = new ListAppender<>();
        logs.start();
        rootLogger.addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        rootLogger.detachAppender(logs);
        logs.stop();
        client.stop();
    }

    @Test
    void validConnectCanSubscribeAndDisconnectWithoutCredentialInNormalLogs() throws Exception {
        String token = jwtProvider.generateToken("integration-user", "USER");
        StompSession session = connect("Bearer " + token, new RecordingHandler());

        StompSession.Subscription subscription = session.subscribe("/topic/coin/TEST", noOpFrameHandler());
        assertTrue(session.isConnected());
        String subscriptionId = subscription.getSubscriptionId();
        assertTrue(waitUntil(() -> hasSubscription(subscriptionId, "/topic/coin/TEST")));
        subscription.unsubscribe();
        session.disconnect();
        assertTrue(waitUntil(() -> !hasSubscription(subscriptionId, "/topic/coin/TEST")));

        assertLogsDoNotContain(token);
    }

    @Test
    void invalidAndExpiredConnectFailWithoutCredentialInErrorOrNormalLogs() throws Exception {
        String expired = new JwtProvider(SECRET, -1).generateToken("integration-user", "USER");
        String malformed = "dummy.invalid.jwt";

        for (String token : List.of(expired, malformed)) {
            RecordingHandler handler = new RecordingHandler();
            Exception failure = assertThrows(Exception.class,
                    () -> connect("Bearer " + token, handler));

            assertFalse(failure.toString().contains(token));
            assertTrue(handler.error.await(5, TimeUnit.SECONDS));
            assertTrue(handler.messages.stream().anyMatch(message -> message.startsWith("ERROR ")));
            assertTrue(handler.messages.stream().noneMatch(message -> message.contains(token)));
            assertLogsDoNotContain(token);
        }
    }

    @Test
    void rawSubscribeAndSendBeforeConnectAreRejected() throws Exception {
        for (String frame : List.of(
                "SUBSCRIBE\nid:raw-sub\ndestination:/topic/coin/TEST\n\n\0",
                "SEND\ndestination:/app/test\n\n{}\0")) {
            RawHandler handler = new RawHandler();
            WebSocketSession socket = rawConnect("/ws-coin", handler);
            socket.sendMessage(new TextMessage(frame));
            assertTrue(handler.events.poll(5, TimeUnit.SECONDS).contains("ERROR"));
            socket.close();
        }
    }

    @Test
    void rawTransportCloseRemovesBrokerSubscriptionAndStockEndpointUsesConnectAuthentication() throws Exception {
        String token = jwtProvider.generateToken("integration-user", "USER");
        RawHandler coinHandler = new RawHandler();
        WebSocketSession coin = rawConnect("/ws-coin", coinHandler);
        coin.sendMessage(new TextMessage(connectFrame(token)));
        assertTrue(coinHandler.events.poll(5, TimeUnit.SECONDS).contains("CONNECTED"));
        coin.sendMessage(new TextMessage("SUBSCRIBE\nid:raw-sub\ndestination:/topic/coin/TEST\n\n\0"));
        assertTrue(waitUntil(() -> hasSubscription("raw-sub", "/topic/coin/TEST")));
        coin.close();
        assertTrue(waitUntil(() -> !hasSubscription("raw-sub", "/topic/coin/TEST")));

        RawHandler stockHandler = new RawHandler();
        WebSocketSession stock = rawConnect("/ws-stock", stockHandler);
        stock.sendMessage(new TextMessage(connectFrame(token)));
        assertTrue(stockHandler.events.poll(5, TimeUnit.SECONDS).contains("CONNECTED"));
        stock.close();
        assertLogsDoNotContain(token);
    }

    private StompSession connect(String authorization, RecordingHandler handler) throws Exception {
        StompHeaders headers = new StompHeaders();
        headers.add("Authorization", authorization);
        return client.connectAsync(
                        "ws://localhost:" + port + "/ws-coin",
                        new WebSocketHttpHeaders(), headers, handler)
                .get(5, TimeUnit.SECONDS);
    }

    private WebSocketSession rawConnect(String path, RawHandler handler) throws Exception {
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.setSecWebSocketProtocol(List.of("v12.stomp"));
        return new StandardWebSocketClient()
                .execute(handler, headers, java.net.URI.create("ws://localhost:" + port + path))
                .get(5, TimeUnit.SECONDS);
    }

    private static String connectFrame(String token) {
        return "CONNECT\naccept-version:1.2\nAuthorization:Bearer " + token + "\n\n\0";
    }

    private void assertLogsDoNotContain(String token) {
        assertTrue(logs.list.stream().noneMatch(event -> {
            String message = event.getFormattedMessage();
            String throwable = event.getThrowableProxy() == null ? "" : ThrowableProxyUtil.asString(event.getThrowableProxy());
            return message.contains(token) || throwable.contains(token);
        }));
    }

    private boolean hasSubscription(String subscriptionId, String destination) {
        SimpMessageHeaderAccessor accessor = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        accessor.setDestination(destination);
        return broker.getSubscriptionRegistry()
                .findSubscriptions(MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders()))
                .values().stream().anyMatch(ids -> ids.contains(subscriptionId));
    }

    private static boolean waitUntil(BooleanSupplier condition) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) return true;
            Thread.sleep(10);
        }
        return condition.getAsBoolean();
    }

    private static StompFrameHandler noOpFrameHandler() {
        return new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return byte[].class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
            }
        };
    }

    private static final class RecordingHandler extends StompSessionHandlerAdapter {
        private final List<String> messages = new CopyOnWriteArrayList<>();
        private final CountDownLatch error = new CountDownLatch(1);

        @Override
        public Type getPayloadType(StompHeaders headers) {
            return byte[].class;
        }

        @Override
        public void handleFrame(StompHeaders headers, Object payload) {
            messages.add("ERROR " + headers + " " + (payload == null ? "" : new String((byte[]) payload)));
            error.countDown();
        }

        @Override
        public void handleTransportError(StompSession session, Throwable exception) {
            messages.add(exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage());
        }

        @Override
        public void handleException(StompSession session, StompCommand command, StompHeaders headers,
                                    byte[] payload, Throwable exception) {
            messages.add(exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage());
        }
    }

    private static final class RawHandler extends TextWebSocketHandler {
        private final BlockingQueue<String> events = new LinkedBlockingQueue<>();

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            events.add(message.getPayload());
        }

        @Override
        public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
            events.add("CLOSED");
        }
    }
}
