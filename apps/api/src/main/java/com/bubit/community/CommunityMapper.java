package com.bubit.community;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface CommunityMapper {
    List<CommunityPost> list(@Param("scope") String scope, @Param("exchange") String exchange,
                            @Param("market") String market, @Param("symbol") String symbol,
                            @Param("sort") String sort, @Param("query") String query,
                            @Param("offset") int offset, @Param("viewer") String viewer);
    List<CommunityPost> comments(@Param("parentId") long parentId, @Param("offset") int offset,
                                 @Param("viewer") String viewer);
    CommunityPost find(@Param("id") long id, @Param("viewer") String viewer);
    void insert(CommunityPost post);
    int update(CommunityPost post);
    int delete(@Param("id") long id, @Param("author") String author);
    void like(@Param("id") long id, @Param("author") String author);
    void unlike(@Param("id") long id, @Param("author") String author);
    CommunityPost image(String imageId);
}
