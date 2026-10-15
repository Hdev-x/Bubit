package com.bubit.common.media;

import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Locale;

public final class ImageUpload {
    private ImageUpload() {}

    public static byte[] normalize(MultipartFile file, int maxBytes, int maxDimension) {
        if (file == null || file.isEmpty()) throw invalid("사진을 선택하세요.");
        if (file.getSize() > maxBytes) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "사진 용량이 너무 큽니다.");
        }
        try (var input = file.getInputStream()) {
            byte[] bytes = input.readNBytes(maxBytes + 1);
            if (bytes.length > maxBytes) throw invalid("사진 용량이 너무 큽니다.");
            try (var imageInput = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(imageInput);
                if (!readers.hasNext()) throw invalid("JPG 또는 PNG 사진만 사용할 수 있습니다.");
                ImageReader reader = readers.next();
                try {
                    String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                    if (!format.equals("jpeg") && !format.equals("png")) throw invalid("JPG 또는 PNG 사진만 사용할 수 있습니다.");
                    reader.setInput(imageInput, true, true);
                    int width = reader.getWidth(0), height = reader.getHeight(0);
                    if (width < 1 || height < 1 || width > 4096 || height > 4096
                            || (long) width * height > 16_000_000) throw invalid("사진은 가로·세로 4096px 이하로 선택하세요.");
                    BufferedImage source = reader.read(0);
                    double scale = Math.min(1d, (double) maxDimension / Math.max(width, height));
                    var result = new BufferedImage(Math.max(1, (int) (width * scale)),
                            Math.max(1, (int) (height * scale)), BufferedImage.TYPE_INT_ARGB);
                    var graphics = result.createGraphics();
                    try {
                        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                        graphics.drawImage(source, 0, 0, result.getWidth(), result.getHeight(), null);
                    } finally {
                        graphics.dispose();
                    }
                    // 원본 메타데이터·추가 payload를 저장하지 않고 디코딩한 픽셀만 보관한다.
                    var output = new ByteArrayOutputStream();
                    ImageIO.write(result, "png", output);
                    return output.toByteArray();
                } finally {
                    reader.dispose();
                }
            }
        } catch (IOException | IllegalArgumentException e) {
            throw invalid("사진 파일을 읽을 수 없습니다.");
        }
    }

    private static ResponseStatusException invalid(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
