package com.bubit.community;

import com.bubit.common.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.security.Principal;

@RestController
@RequestMapping("/api/community")
@RequiredArgsConstructor
public class CommunityController {
    private final CommunityService service;

    @GetMapping("/posts")
    public ResponseEntity<CommunityService.Page> list(@RequestParam(defaultValue = "feed") String scope,
            @RequestParam(defaultValue = "") String exchange, @RequestParam(defaultValue = "") String market,
            @RequestParam(defaultValue = "") String symbol, @RequestParam(defaultValue = "latest") String sort,
            @RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "0") int page, Principal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(scope, exchange, market,
                symbol, sort, q, page, principal == null ? null : principal.getName()));
    }

    @GetMapping("/posts/{id}/comments")
    public ResponseEntity<CommunityService.Page> comments(@PathVariable long id,
            @RequestParam(defaultValue = "0") int page, Principal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                service.comments(id, page, principal == null ? null : principal.getName()));
    }

    @PostMapping(value = "/posts", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CommunityPost create(@RequestParam String scope, @RequestParam(defaultValue = "") String exchange,
            @RequestParam(defaultValue = "") String market, @RequestParam(defaultValue = "") String symbol,
            @RequestParam(required = false) Long parentId, @RequestParam(defaultValue = "") String title,
            @RequestParam String body, @RequestParam(required = false) MultipartFile image) {
        return service.create(scope, exchange, market, symbol, parentId, title, body, image, CurrentUser.username());
    }

    @PutMapping("/posts/{id}")
    public CommunityPost edit(@PathVariable long id, @RequestBody CommunityService.Edit edit) {
        return service.edit(id, edit, CurrentUser.username());
    }

    @DeleteMapping("/posts/{id}")
    public void delete(@PathVariable long id) { service.delete(id, CurrentUser.username()); }

    @PostMapping("/posts/{id}/like")
    public void like(@PathVariable long id) { service.like(id, CurrentUser.username(), true); }

    @DeleteMapping("/posts/{id}/like")
    public void unlike(@PathVariable long id) { service.like(id, CurrentUser.username(), false); }

    @GetMapping(value = "/images/{imageId}", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> image(@PathVariable String imageId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).header("X-Content-Type-Options", "nosniff")
                .body(service.image(imageId));
    }
}
