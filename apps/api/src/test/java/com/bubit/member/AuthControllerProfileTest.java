package com.bubit.member;

import com.bubit.common.security.JwtProvider;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AuthControllerProfileTest {
    @Test
    void signupRequiresANicknameInsteadOfPublishingTheLoginEmail() throws Exception {
        MemberService members = mock(MemberService.class);
        var controller = new AuthController(members, mock(PasswordEncoder.class), mock(JwtProvider.class), mock(ProfileService.class));
        for (String name : new String[]{null, " ", "a", "가".repeat(21)}) {
            var request = new MemberDTO();
            request.setUsername("private-email@example.test");
            request.setPassword("sample-password");
            request.setName(name);
            assertEquals(400, controller.register(request).getStatusCode().value());
            assertNotEquals(request.getUsername(), request.getName());
        }
        verifyNoInteractions(members);
    }

    @Test
    void sessionRestoreIncludesPersistedProfileButNeverPassword() throws Exception {
        MemberService members = mock(MemberService.class);
        ProfileService profiles = mock(ProfileService.class);
        MemberDTO member = new MemberDTO();
        member.setName("부빗 사용자");
        member.setPassword("stored-password-hash");
        when(members.read(any())).thenReturn(member);
        when(profiles.avatarUrl("owner")).thenReturn("/api/profiles/avatars/test-id");
        var controller = new AuthController(members, mock(PasswordEncoder.class), mock(JwtProvider.class), profiles);
        var auth = new UsernamePasswordAuthenticationToken("owner", null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
        var result = controller.me(auth);
        var body = (Map<?, ?>) result.getBody();
        assertNotNull(body);
        assertEquals("부빗 사용자", body.get("name"));
        assertEquals("/api/profiles/avatars/test-id", body.get("avatarUrl"));
        assertFalse(body.containsKey("password"));
        assertEquals(401, controller.me(null).getStatusCode().value());
    }
}
