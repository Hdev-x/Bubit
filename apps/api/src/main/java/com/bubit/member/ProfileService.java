package com.bubit.member;

import com.bubit.common.media.ImageUpload;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProfileService {
    private final MemberService members;
    private final ProfileMapper profiles;

    public String avatarUrl(String username) {
        String id = profiles.avatarId(username);
        return id == null ? null : "/api/profiles/avatars/" + id;
    }

    public String updateName(String username, String name) throws Exception {
        String nickname = validateName(name);
        var member = new MemberDTO();
        member.setUsername(username);
        member.setName(nickname);
        if (members.update(member) != 1) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "회원 정보를 찾을 수 없습니다.");
        return nickname;
    }

    public static String validateName(String name) {
        String nickname = name == null ? "" : name.strip();
        int length = nickname.codePointCount(0, nickname.length());
        if (length < 2 || length > 20 || nickname.codePoints().anyMatch(Character::isISOControl)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "닉네임은 2~20자로 입력하세요.");
        }
        return nickname;
    }

    public String updateAvatar(String username, MultipartFile file) throws Exception {
        var query = new MemberDTO();
        query.setUsername(username);
        if (members.read(query) == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "회원 정보를 찾을 수 없습니다.");
        byte[] data = ImageUpload.normalize(file, 1024 * 1024, 256);
        String id = UUID.randomUUID().toString();
        profiles.saveAvatar(username, id, data);
        return "/api/profiles/avatars/" + id;
    }

    public byte[] avatar(UUID id) {
        ProfileMapper.Photo photo = profiles.avatar(id.toString());
        if (photo == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return photo.data();
    }
}
