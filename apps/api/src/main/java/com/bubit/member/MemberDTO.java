package com.bubit.member;

import java.util.List;
import lombok.Getter;
import lombok.Setter;

/** 회원 요청과 MyBatis 결과를 전달한다. 민감 필드는 로그용 문자열에 포함하지 않는다. */
@Getter
@Setter
public class MemberDTO {
    private String username;
    private String name;
    // 요청에서는 입력값, DB 조회에서는 BCrypt 해시를 담는다.
    private String password;
    private Long cash;
    private String email;
    private List<RoleDTO> roles;
}
