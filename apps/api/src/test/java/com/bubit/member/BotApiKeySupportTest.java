package com.bubit.member;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BotApiKeySupportTest {
    private final BotApiKeyMapper mapper = mock(BotApiKeyMapper.class);
    private final BotApiKeyService service = new BotApiKeyService(mapper);

    @Test
    void excludesCredentialsFromDiagnosticStrings() {
        var request = new BotApiKeyDTO();
        request.setApiKey("dummy-api-key");
        request.setSecretKey("dummy-secret-key");
        request.setPassphrase("dummy-passphrase");
        String description = request.toString();
        assertFalse(description.contains("dummy-api-key"));
        assertFalse(description.contains("dummy-secret-key"));
        assertFalse(description.contains("dummy-passphrase"));
    }

    @Test
    void rejectsUnsupportedNewKeysWithoutChangingExistingKeys() {
        var request = new BotApiKeyDTO();
        request.setExchange("BINANCE");
        assertThrows(IllegalArgumentException.class, () -> service.saveKey("owner", request, false));
        verifyNoInteractions(mapper);
    }

    @Test
    void keepsUnsupportedExistingKeysDeletableButDoesNotActivateThem() throws Exception {
        var legacy = new BotApiKeyDTO();
        legacy.setExchange("BINANCE");
        when(mapper.selectByIdAndMemberId(1, "owner")).thenReturn(legacy);
        assertThrows(IllegalArgumentException.class, () -> service.activateKey("owner", 1));
        verify(mapper, never()).activateByIdAndMemberId(anyInt(), anyString());
        when(mapper.deleteByIdAndMemberId(1, "owner")).thenReturn(1);
        assertTrue(service.deleteKey("owner", 1));
        assertFalse(service.deleteKey("other-owner", 1));
    }
}
