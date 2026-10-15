package com.bubit.community;

import com.bubit.common.media.ImageUpload;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CommunityService {
    private final CommunityMapper mapper;
    private final SimpMessagingTemplate messages;
    private static final Set<String> EXCHANGES = Set.of("bitget", "binance", "upbit", "bithumb", "kis");
    private static final Set<String> MARKETS = Set.of("spot", "futures", "stock");

    public record Page(List<CommunityPost> items, boolean hasMore) {}
    public record Edit(String title, String body) {}

    public Page list(String scope, String exchange, String market, String symbol, String sort,
                     String query, int page, String viewer) {
        String normalized = context(scope, exchange, market, symbol);
        if (!Set.of("latest", "popular").contains(sort) || query.length() > 100) throw badRequest();
        String search = query.isBlank() ? "" : "%" + query.trim().toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return page(mapper.list(scope, exchange, market, normalized, sort, search, offset(page), viewer));
    }

    public Page comments(long id, int page, String viewer) {
        CommunityPost parent = require(id, viewer);
        if (parent.getParentId() != null) throw badRequest();
        return page(mapper.comments(id, offset(page), viewer));
    }

    @Transactional
    public CommunityPost create(String scope, String exchange, String market, String symbol, Long parentId,
                                String title, String body, MultipartFile image, String author) {
        CommunityPost post = new CommunityPost();
        if (parentId != null) {
            CommunityPost parent = require(parentId, author);
            if (parent.getParentId() != null) throw badRequest();
            scope = parent.getScope(); exchange = parent.getExchange();
            market = parent.getMarket(); symbol = parent.getSymbol();
        }
        post.setScope(scope);
        post.setSymbol(context(scope, exchange, market, symbol));
        post.setExchange("feed".equals(scope) ? exchange : "");
        post.setMarket("feed".equals(scope) ? market : "");
        post.setParentId(parentId);
        post.setAuthor(author);
        setContent(post, title, body);
        if (image != null && !image.isEmpty()) {
            post.setImageData(ImageUpload.normalize(image, 1024 * 1024, 1280));
            post.setImageId(UUID.randomUUID().toString());
        }
        mapper.insert(post);
        changed(post);
        return require(post.getId(), author);
    }

    @Transactional
    public CommunityPost edit(long id, Edit edit, String author) {
        CommunityPost post = owned(id, author);
        setContent(post, edit.title(), edit.body());
        if (mapper.update(post) != 1) throw missing();
        changed(post);
        return require(id, author);
    }

    @Transactional
    public void delete(long id, String author) {
        CommunityPost post = owned(id, author);
        if (mapper.delete(id, author) != 1) throw missing();
        changed(post);
    }

    @Transactional
    public void like(long id, String author, boolean liked) {
        CommunityPost post = require(id, author);
        if (liked) mapper.like(id, author); else mapper.unlike(id, author);
        changed(post);
    }

    public byte[] image(String imageId) {
        try { UUID.fromString(imageId); } catch (IllegalArgumentException error) { throw missing(); }
        CommunityPost image = mapper.image(imageId);
        if (image == null || image.getImageData() == null) throw missing();
        return image.getImageData();
    }

    private CommunityPost require(long id, String viewer) {
        CommunityPost post = mapper.find(id, viewer);
        if (post == null) throw missing();
        return post;
    }

    private CommunityPost owned(long id, String author) {
        CommunityPost post = require(id, author);
        if (!post.getAuthor().equals(author)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "본인 글만 변경할 수 있습니다.");
        return post;
    }

    private static void setContent(CommunityPost post, String title, String body) {
        title = title == null ? "" : title.trim();
        body = body == null ? "" : body.trim();
        if (body.isEmpty() || body.length() > 2000 || title.length() > 120
                || (post.getParentId() == null && "board".equals(post.getScope()) && title.isEmpty())) throw badRequest();
        post.setTitle(post.getParentId() == null && "board".equals(post.getScope()) ? title : "");
        post.setBody(body);
    }

    private static String context(String scope, String exchange, String market, String symbol) {
        if ("board".equals(scope)) return "";
        if (!"feed".equals(scope) || !EXCHANGES.contains(exchange) || !MARKETS.contains(market)
                || symbol == null || !symbol.toUpperCase(Locale.ROOT).matches("[\\p{L}\\p{N}_-]{1,40}")) throw badRequest();
        return symbol.toUpperCase(Locale.ROOT);
    }

    private static int offset(int page) {
        if (page < 0 || page > 10000) throw badRequest();
        return page * 20;
    }

    private static Page page(List<CommunityPost> posts) {
        return new Page(posts.stream().limit(20).toList(), posts.size() > 20);
    }

    private void changed(CommunityPost post) {
        String topic = "/topic/community/" + ("board".equals(post.getScope()) ? "board"
                : "feed/" + post.getExchange() + "/" + post.getMarket() + "/" + post.getSymbol());
        // Publish only committed changes; public events contain no author identifier or personalized flags.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { messages.convertAndSend(topic, Map.of("changed", true)); }
        });
    }

    private static ResponseStatusException badRequest() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "글 내용 또는 조회 조건을 확인해주세요.");
    }
    private static ResponseStatusException missing() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "글을 찾을 수 없습니다.");
    }
}
