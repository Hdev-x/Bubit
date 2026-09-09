package com.bubit.member;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class CredentialDtoTest {
    @Test
    void defaultStringRepresentationDoesNotExposeCredentials() {
        MemberDTO member = new MemberDTO();
        member.setPassword("member-password-fixture");
        BotApiKeyDTO key = new BotApiKeyDTO();
        key.setApiKey("api-key-fixture");
        key.setSecretKey("secret-key-fixture");
        key.setPassphrase("passphrase-fixture");

        assertThat(member.toString()).doesNotContain(member.getPassword());
        assertThat(key.toString()).doesNotContain(key.getApiKey(), key.getSecretKey(), key.getPassphrase());
    }
}
