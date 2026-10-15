package com.bubit.member;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ProfileServiceTest {
    private final MemberService members = mock(MemberService.class);
    private final ProfileMapper mapper = mock(ProfileMapper.class);
    private final ProfileService service = new ProfileService(members, mapper);

    @Test
    void updatesOnlyTheAuthenticatedMembersNickname() throws Exception {
        when(members.update(any())).thenReturn(1);
        assertEquals("새 닉네임", service.updateName("owner@example.test", "  새 닉네임  "));
        var value = org.mockito.ArgumentCaptor.forClass(MemberDTO.class);
        verify(members).update(value.capture());
        assertEquals("owner@example.test", value.getValue().getUsername());
        assertEquals("새 닉네임", value.getValue().getName());
        assertNull(value.getValue().getPassword());
        assertNull(value.getValue().getCash());
    }

    @Test
    void rejectsInvalidNicknamesAndMissingMembers() throws Exception {
        for (String name : new String[]{"", "a", "가".repeat(21), "abc\u0000def"}) {
            assertThrows(ResponseStatusException.class, () -> service.updateName("owner", name));
        }
        verifyNoInteractions(members);
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> service.updateName("missing", "정상 이름")).getStatusCode().value());
    }

    @Test
    void avatarUrlsUseOpaqueIdsAndMissingImagesAre404() {
        when(mapper.avatarId("owner@example.test")).thenReturn("f7a96081-7f0d-4a42-aada-af609b6c5f16");
        assertEquals("/api/profiles/avatars/f7a96081-7f0d-4a42-aada-af609b6c5f16", service.avatarUrl("owner@example.test"));
        assertNull(service.avatarUrl("no-photo"));
        assertThrows(ResponseStatusException.class, () -> service.avatar(java.util.UUID.randomUUID()));
    }
}
