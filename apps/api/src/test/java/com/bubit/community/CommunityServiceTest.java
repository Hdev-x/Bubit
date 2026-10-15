package com.bubit.community;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CommunityServiceTest {
    private final CommunityMapper mapper = mock(CommunityMapper.class);
    private final SimpMessagingTemplate messages = mock(SimpMessagingTemplate.class);
    private final CommunityService service = new CommunityService(mapper, messages);

    @BeforeEach void startTransaction() { TransactionSynchronizationManager.initSynchronization(); }
    @AfterEach void endTransaction() { TransactionSynchronizationManager.clearSynchronization(); }

    @Test void anotherMemberCannotEditOrDelete() {
        CommunityPost post = post();
        when(mapper.find(1, "other")).thenReturn(post);
        var error = assertThrows(ResponseStatusException.class,
                () -> service.edit(1, new CommunityService.Edit("", "changed"), "other"));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        assertThrows(ResponseStatusException.class, () -> service.delete(1, "other"));
        verify(mapper, never()).update(any());
        verify(mapper, never()).delete(anyLong(), anyString());
        verifyNoInteractions(messages);
    }

    @Test void rejectsEmptyBodyInvalidTopicAndDeepReplies() {
        assertThrows(ResponseStatusException.class, () -> service.create("feed", "bitget", "spot", "BTCUSDT", null, "", " ", null, "member"));
        assertThrows(ResponseStatusException.class, () -> service.list("feed", "bitget", "spot", "BTC/../../admin", "latest", "", 0, null));
        CommunityPost child = post(); child.setParentId(2L);
        when(mapper.find(1, "member")).thenReturn(child);
        assertThrows(ResponseStatusException.class, () -> service.create("board", "", "", "", 1L, "", "reply", null, "member"));
        verify(mapper, never()).insert(any());
    }

    @Test void changesPublishOnlyAfterCommitAndContainNoMemberData() {
        when(mapper.find(1, "member")).thenReturn(post());
        when(mapper.update(any())).thenReturn(1);
        service.edit(1, new CommunityService.Edit("", "changed"), "member");
        verifyNoInteractions(messages);
        TransactionSynchronizationManager.getSynchronizations().forEach(sync -> sync.afterCommit());
        verify(messages).convertAndSend(eq("/topic/community/feed/bitget/spot/BTCUSDT"), eq(java.util.Map.of("changed", true)));
    }

    @Test void publicPostDoesNotSerializeMemberIdentifierOrImageBytes() throws Exception {
        CommunityPost post = post(); post.setImageData(new byte[]{1, 2, 3});
        var json = new ObjectMapper().valueToTree(post);
        assertFalse(json.has("author")); assertFalse(json.has("imageData"));
        assertFalse(json.toString().contains("member"));
    }

    @Test void listUsesBoundedPagingAndOneExtraRow() {
        when(mapper.list(anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyInt(), isNull()))
                .thenReturn(java.util.Collections.nCopies(21, post()));
        var result = service.list("feed", "bitget", "spot", "btcusdt", "latest", "", 1, null);
        assertEquals(20, result.items().size()); assertTrue(result.hasMore());
        verify(mapper).list("feed", "bitget", "spot", "BTCUSDT", "latest", "", 20, null);
        service.list("feed", "binance", "spot", "币安人生USDT", "latest", "", 0, null);
        verify(mapper).list("feed", "binance", "spot", "币安人生USDT", "latest", "", 0, null);
        assertThrows(ResponseStatusException.class, () -> service.list("board", "", "", "", "latest", "", -1, null));
    }

    private CommunityPost post() {
        CommunityPost post = new CommunityPost();
        post.setId(1L); post.setAuthor("member"); post.setScope("feed");
        post.setExchange("bitget"); post.setMarket("spot"); post.setSymbol("BTCUSDT");
        return post;
    }
}
