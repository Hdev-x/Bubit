package com.bubit.member;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Arg;
import org.apache.ibatis.annotations.ConstructorArgs;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface ProfileMapper {
    record Photo(byte[] data) {}

    @Select("SELECT avatar_id::text FROM member_profiles WHERE member_id = #{username}")
    String avatarId(String username);

    @Select("SELECT avatar_data FROM member_profiles WHERE avatar_id = CAST(#{id} AS uuid)")
    @ConstructorArgs(@Arg(column = "avatar_data", javaType = byte[].class))
    Photo avatar(String id);

    @Insert("""
            INSERT INTO member_profiles (member_id, avatar_id, avatar_data)
            VALUES (#{username}, CAST(#{id} AS uuid), #{data})
            ON CONFLICT (member_id) DO UPDATE
            SET avatar_id = EXCLUDED.avatar_id, avatar_data = EXCLUDED.avatar_data, updated_at = CURRENT_TIMESTAMP
            """)
    void saveAvatar(@Param("username") String username, @Param("id") String id, @Param("data") byte[] data);
}
