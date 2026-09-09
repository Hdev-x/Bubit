package com.bubit.member;

import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;

import static org.assertj.core.api.Assertions.assertThat;

@MybatisTest
@ActiveProfiles("test")
@Sql(scripts = "file:../../docs/schema.sql")
class PublicSchemaTest {

    @Autowired
    private MemberMapper memberMapper;

    @Test
    void createsAndReadsMemberWithPublicSchema() throws Exception {
        MemberDTO signup = new MemberDTO();
        signup.setUsername("public-test@example.com");
        signup.setName("Public Test");
        signup.setPassword("bcrypt-hash-placeholder");

        assertThat(memberMapper.create(signup)).isEqualTo(1);

        MemberDTO login = new MemberDTO();
        login.setUsername(signup.getUsername());
        MemberDTO saved = memberMapper.login(login);

        assertThat(saved.getUsername()).isEqualTo(signup.getUsername());
        assertThat(saved.getName()).isEqualTo(signup.getName());
        assertThat(saved.getPassword()).isEqualTo(signup.getPassword());
        assertThat(saved.getRoles()).singleElement()
                .extracting(RoleDTO::getRoleName)
                .isEqualTo("USER");
    }
}
