package com.bubit.market.coin;

import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/** 테스트용 WebSocket — 보낸 텍스트를 기록하고, failSends면 sendText가 실패한 future를 돌려준다. */
final class FakeWebSocket implements WebSocket {
    final List<String> sent = new ArrayList<>();
    volatile boolean aborted;
    volatile boolean failSends;

    @Override public CompletableFuture<WebSocket> sendText(CharSequence data, boolean last) {
        sent.add(data.toString());
        return failSends ? CompletableFuture.failedFuture(new IllegalStateException("send failed")) : CompletableFuture.completedFuture(this);
    }
    @Override public CompletableFuture<WebSocket> sendBinary(ByteBuffer data, boolean last) { return CompletableFuture.completedFuture(this); }
    @Override public CompletableFuture<WebSocket> sendPing(ByteBuffer message) { return CompletableFuture.completedFuture(this); }
    @Override public CompletableFuture<WebSocket> sendPong(ByteBuffer message) { return CompletableFuture.completedFuture(this); }
    @Override public CompletableFuture<WebSocket> sendClose(int statusCode, String reason) { return CompletableFuture.completedFuture(this); }
    @Override public void request(long n) {}
    @Override public String getSubprotocol() { return ""; }
    @Override public boolean isOutputClosed() { return aborted; }
    @Override public boolean isInputClosed() { return aborted; }
    @Override public void abort() { aborted = true; }
}
