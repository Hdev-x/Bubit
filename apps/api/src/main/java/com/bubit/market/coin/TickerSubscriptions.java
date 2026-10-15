package com.bubit.market.coin;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;
import org.springframework.web.socket.messaging.SessionUnsubscribeEvent;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Component
public class TickerSubscriptions {
    private static final Pattern TOPIC = Pattern.compile(
            "^/topic/(?:coin(?:-futures)?|binance-(?:spot|futures))/[\\p{L}\\p{N}_-]+$");
    private final Map<Subscription, String> subscriptions = new HashMap<>();
    private final Map<String, Long> closedSessions = new HashMap<>();
    private volatile Set<String> activeTopics = Set.of();

    public boolean hasSubscribers(String topic) {
        return activeTopics.contains(topic);
    }

    @EventListener
    public synchronized void onSubscribe(SessionSubscribeEvent event) {
        StompHeaderAccessor h = StompHeaderAccessor.wrap(event.getMessage());
        String topic = h.getDestination();
        if (topic == null || !TOPIC.matcher(topic).matches()
                || h.getSessionId() == null || h.getSubscriptionId() == null
                || closedSessions.containsKey(h.getSessionId())) return;
        subscriptions.put(new Subscription(h.getSessionId(), h.getSubscriptionId()), topic);
        activeTopics = Set.copyOf(subscriptions.values());
    }

    @EventListener
    public synchronized void onUnsubscribe(SessionUnsubscribeEvent event) {
        StompHeaderAccessor h = StompHeaderAccessor.wrap(event.getMessage());
        subscriptions.remove(new Subscription(h.getSessionId(), h.getSubscriptionId()));
        activeTopics = Set.copyOf(subscriptions.values());
    }

    @EventListener
    public synchronized void onDisconnect(SessionDisconnectEvent event) {
        String session = event.getSessionId();
        // Kline relay와 같이 늦게 도착한 SUBSCRIBE가 끊긴 세션을 복원하지 않게 한다.
        closedSessions.put(session, System.currentTimeMillis());
        subscriptions.keySet().removeIf(key -> key.session().equals(session));
        activeTopics = Set.copyOf(subscriptions.values());
    }

    @Scheduled(fixedDelay = 60_000)
    public synchronized void forgetClosedSessions() {
        long cutoff = System.currentTimeMillis() - 60_000;
        closedSessions.values().removeIf(closedAt -> closedAt < cutoff);
    }

    private record Subscription(String session, String id) {}
}
