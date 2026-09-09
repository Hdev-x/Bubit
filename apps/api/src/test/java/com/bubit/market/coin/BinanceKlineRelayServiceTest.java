package com.bubit.market.coin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;
import org.springframework.web.socket.messaging.SessionUnsubscribeEvent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

class BinanceKlineRelayServiceTest {

    private static Message<byte[]> stomp(StompCommand cmd, String session, String subId, String dest) {
        StompHeaderAccessor a = StompHeaderAccessor.create(cmd);
        a.setSessionId(session);
        if (subId != null) a.setSubscriptionId(subId);
        if (dest != null) a.setDestination(dest);
        return MessageBuilder.createMessage(new byte[0], a.getMessageHeaders());
    }

    private static BinanceKlineRelayService service() {
        return new BinanceKlineRelayService(mock(SimpMessagingTemplate.class), new ObjectMapper()); // start()는 호출하지 않음(거래소 연결 없음)
    }

    @Test
    void 세션_두_개가_같은_스트림을_구독하면_refcount_2_하나가_끊기면_1() {
        BinanceKlineRelayService s = service();
        String dest = "/topic/binance-kline/futures/BTCUSDT/1h";
        s.onSubscribe(new SessionSubscribeEvent(this, stomp(StompCommand.SUBSCRIBE, "s1", "sub-1", dest)));
        s.onSubscribe(new SessionSubscribeEvent(this, stomp(StompCommand.SUBSCRIBE, "s2", "sub-1", dest)));
        assertEquals(2, s.refCountFor("futures", "btcusdt@kline_1h"));
        s.onDisconnect(new SessionDisconnectEvent(this, stomp(StompCommand.DISCONNECT, "s1", null, null), "s1", CloseStatus.NORMAL));
        assertEquals(1, s.refCountFor("futures", "btcusdt@kline_1h"));
        s.onUnsubscribe(new SessionUnsubscribeEvent(this, stomp(StompCommand.UNSUBSCRIBE, "s2", "sub-1", null)));
        assertEquals(0, s.refCountFor("futures", "btcusdt@kline_1h"));
    }

    @Test
    void 종료된_세션의_늦은_SUBSCRIBE는_무시된다_고아_구독_방지() {
        // DISCONNECT 경합 회귀: subToStream.put과 incref 사이에 DISCONNECT가 끼면 매핑은 지워지고 refcount 1이 남았다.
        BinanceKlineRelayService s = service();
        String dest = "/topic/binance-kline/spot/ETHUSDT/1Dutc";
        s.onDisconnect(new SessionDisconnectEvent(this, stomp(StompCommand.DISCONNECT, "s9", null, null), "s9", CloseStatus.NORMAL));
        s.onSubscribe(new SessionSubscribeEvent(this, stomp(StompCommand.SUBSCRIBE, "s9", "sub-1", dest)));
        assertEquals(0, s.refCountFor("spot", "ethusdt@kline_1Dutc"), "종료 뒤 도착한 구독은 소유자가 없으므로 refcount를 올리지 않는다");
    }

    @Test
    void 잘못된_destination은_무시한다() {
        BinanceKlineRelayService s = service();
        s.onSubscribe(new SessionSubscribeEvent(this, stomp(StompCommand.SUBSCRIBE, "s1", "sub-1", "/topic/binance-kline/other/BTCUSDT/1h")));
        s.onSubscribe(new SessionSubscribeEvent(this, stomp(StompCommand.SUBSCRIBE, "s1", "sub-2", "/topic/coin/BTCUSDT")));
        assertEquals(0, s.refCountFor("futures", "btcusdt@kline_1h"));
    }
}
