package com.bubit.community;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
public class CommunityPost {
    private Long id;
    private Long parentId;
    private String scope;
    private String exchange;
    private String market;
    private String symbol;
    private String title;
    private String body;
    @JsonIgnore private String author;
    private String authorName;
    private String avatarUrl;
    private boolean owned;
    private boolean liked;
    private long likeCount;
    private long commentCount;
    private String imageId;
    @JsonIgnore private byte[] imageData;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
