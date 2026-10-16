package com.bubit.community;

import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class CommunityMapperTest {
    private JdbcTemplate jdbc;
    private SqlSessionFactory sessions;
    private UUID avatar;

    @BeforeEach void setUp() {
        var source = new DriverManagerDataSource("jdbc:h2:mem:community-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE", "sa", "");
        jdbc = new JdbcTemplate(source);
        jdbc.execute("CREATE TABLE members(email VARCHAR PRIMARY KEY, nickname VARCHAR)");
        jdbc.execute("CREATE TABLE member_profiles(member_id VARCHAR PRIMARY KEY, avatar_id UUID)");
        jdbc.execute("""
                CREATE TABLE community_posts(id BIGSERIAL PRIMARY KEY, parent_id BIGINT, scope VARCHAR,
                  exchange VARCHAR, market VARCHAR, symbol VARCHAR, title VARCHAR, body VARCHAR, author VARCHAR,
                  image_id VARCHAR, image_data BYTEA, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)
                """);
        jdbc.execute("CREATE TABLE community_likes(post_id BIGINT, member_id VARCHAR, PRIMARY KEY(post_id, member_id))");
        jdbc.update("INSERT INTO members VALUES (?, ?)", "owner", "닉네임");
        avatar = UUID.randomUUID();
        jdbc.update("INSERT INTO member_profiles VALUES (?, ?)", "owner", avatar);

        var config = new Configuration(new Environment("community-test", new JdbcTransactionFactory(), source));
        config.setMapUnderscoreToCamelCase(true);
        config.addMapper(CommunityMapper.class);
        sessions = new SqlSessionFactoryBuilder().build(config);
    }

    @Test void sqlKeepsOwnershipProfileAndImageContracts() {
        try (var session = sessions.openSession(true)) {
            var mapper = session.getMapper(CommunityMapper.class);
            var post = new CommunityPost();
            post.setScope("feed"); post.setExchange("bitget"); post.setMarket("spot"); post.setSymbol("BTCUSDT");
            post.setTitle(""); post.setBody("안녕하세요"); post.setAuthor("owner");
            post.setImageId(UUID.randomUUID().toString()); post.setImageData(new byte[]{1, 2});
            mapper.insert(post);
            assertNotNull(post.getId());
            var ownerView = mapper.find(post.getId(), "owner");
            assertTrue(ownerView.isOwned()); assertEquals("닉네임", ownerView.getAuthorName());
            assertEquals("/api/profiles/avatars/" + avatar, ownerView.getAvatarUrl());
            assertFalse(mapper.find(post.getId(), null).isOwned());
            assertArrayEquals(new byte[]{1, 2}, mapper.image(post.getImageId()).getImageData());
            assertEquals(1, mapper.list("feed", "bitget", "spot", "BTCUSDT", "latest", "", 0, null).size());
            assertEquals(0, mapper.list("feed", "bitget", "spot", "ETHUSDT", "latest", "", 0, null).size());
            post.setAuthor("other"); post.setBody("tampered");
            assertEquals(0, mapper.update(post)); assertEquals(0, mapper.delete(post.getId(), "other"));
            assertEquals("안녕하세요", mapper.find(post.getId(), null).getBody());
        }
    }

    @Test void legacyEmailOrMissingNicknameIsNeitherDisplayedNorSearchable() {
        String[] nicknames = { "  LEGACY0@example.com  ", "   ", null };
        for (int index = 0; index < nicknames.length; index++) {
            String email = "legacy" + index + "@example.com";
            jdbc.update("INSERT INTO members VALUES (?, ?)", email, nicknames[index]);
            jdbc.update("""
                    INSERT INTO community_posts(scope, exchange, market, symbol, title, body, author)
                    VALUES ('feed', 'bitget', 'spot', 'BTCUSDT', '', '공개 글', ?)
                    """, email);
        }
        try (var session = sessions.openSession(true)) {
            var mapper = session.getMapper(CommunityMapper.class);
            var posts = mapper.list("feed", "bitget", "spot", "BTCUSDT", "latest", "", 0, null);
            assertEquals(3, posts.size());
            assertTrue(posts.stream().allMatch(post -> "회원".equals(post.getAuthorName())));
            assertTrue(mapper.list("feed", "bitget", "spot", "BTCUSDT", "latest", "%example.com%", 0, null).isEmpty());
            assertEquals(3, mapper.list("feed", "bitget", "spot", "BTCUSDT", "latest", "%회원%", 0, null).size());
        }
    }
}
