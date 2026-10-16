package com.bubit.market.coin;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;
import org.springframework.web.socket.messaging.SessionUnsubscribeEvent;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TickerSubscriptionsTest {
    private final TickerSubscriptions subscriptions = new TickerSubscriptions();
    private final String topic = "/topic/coin/BTCUSDT";

    @Test
    void 같은_종목의_다른_세션은_독립적으로_해제되고_중복_구독은_남지_않는다() {
        subscribe("s1", "a", topic);
        subscribe("s1", "a", topic);
        subscribe("s2", "a", topic);
        subscriptions.onUnsubscribe(new SessionUnsubscribeEvent(this,
                stomp(StompCommand.UNSUBSCRIBE, "s1", "a", null)));
        assertTrue(subscriptions.hasSubscribers(topic));
        disconnect("s2");
        assertFalse(subscriptions.hasSubscribers(topic));
        subscribe("s2", "b", topic);
        assertFalse(subscriptions.hasSubscribers(topic));
    }

    @Test
    void 구독ID_교체는_이전_topic을_정리하고_다른_시장과_잘못된_topic은_섞지_않는다() {
        subscribe("s1", "a", topic);
        String futures = "/topic/coin-futures/BTCUSDT";
        subscribe("s1", "a", futures);
        assertFalse(subscriptions.hasSubscribers(topic));
        assertTrue(subscriptions.hasSubscribers(futures));
        String unicode = "/topic/binance-spot/币安人生USDT";
        subscribe("s1", "b", unicode);
        assertTrue(subscriptions.hasSubscribers(unicode));
        for (String invalid : new String[]{"/topic/coin/*", "/topic/coin/BTC/USDT",
                "/topic/binance-kline/spot/BTCUSDT/1h", "/topic/coin/BTCUSDT\n"}) {
            subscribe("s1", "invalid", invalid);
            assertFalse(subscriptions.hasSubscribers(invalid));
        }
        disconnect("s1");
        assertFalse(subscriptions.hasSubscribers(futures));
        assertFalse(subscriptions.hasSubscribers(unicode));
    }

    private void subscribe(String session, String id, String destination) {
        subscriptions.onSubscribe(new SessionSubscribeEvent(this,
                stomp(StompCommand.SUBSCRIBE, session, id, destination)));
    }

    private void disconnect(String session) {
        subscriptions.onDisconnect(new SessionDisconnectEvent(this,
                stomp(StompCommand.DISCONNECT, session, null, null), session, CloseStatus.NORMAL));
    }

    private static Message<byte[]> stomp(StompCommand command, String session, String id, String destination) {
        StompHeaderAccessor headers = StompHeaderAccessor.create(command);
        headers.setSessionId(session);
        if (id != null) headers.setSubscriptionId(id);
        if (destination != null) headers.setDestination(destination);
        return MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
    }
}
