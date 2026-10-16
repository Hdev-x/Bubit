package com.bubit.member;

import com.bubit.common.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class ProfileController {
    private final ProfileService profiles;

    public record NameUpdate(String name) {}

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<?> invalidRequest(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message",
                error.getReason() == null ? "프로필을 찾을 수 없습니다." : error.getReason()));
    }

    @PutMapping("/api/user/profile")
    public Map<String, String> update(@RequestBody NameUpdate request) throws Exception {
        return Map.of("name", profiles.updateName(CurrentUser.username(), request.name()));
    }

    @PostMapping(value = "/api/user/profile/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, String> upload(@RequestPart("file") MultipartFile file) throws Exception {
        return Map.of("avatarUrl", profiles.updateAvatar(CurrentUser.username(), file));
    }

    @GetMapping("/api/profiles/avatars/{id}")
    public ResponseEntity<byte[]> avatar(@PathVariable UUID id) {
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG)
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .body(profiles.avatar(id));
    }
}
