package com.bubit.common.media;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;

import static org.junit.jupiter.api.Assertions.*;

class ImageUploadTest {
    @Test
    void validatesActualImageAndResizesWithoutUsingTheFilename() throws Exception {
        var source = new BufferedImage(600, 300, BufferedImage.TYPE_INT_RGB);
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(source, "jpeg", bytes);
        var file = new MockMultipartFile("file", "../../photo.html", "text/html", bytes.toByteArray());
        byte[] result = ImageUpload.normalize(file, 1024 * 1024, 256);
        var image = ImageIO.read(new ByteArrayInputStream(result));
        assertEquals(256, image.getWidth());
        assertEquals(128, image.getHeight());
        assertEquals((byte) 0x89, result[0]);
        assertEquals('P', result[1]);
    }

    @Test
    void rejectsDisguisedAndOversizedUploads() {
        var disguised = new MockMultipartFile("file", "photo.png", "image/png", "<svg onload='alert(1)'/>".getBytes());
        assertThrows(ResponseStatusException.class, () -> ImageUpload.normalize(disguised, 1024, 256));
        var oversized = new MockMultipartFile("file", new byte[1025]);
        assertEquals(413, assertThrows(ResponseStatusException.class,
                () -> ImageUpload.normalize(oversized, 1024, 256)).getStatusCode().value());
    }

    @Test
    void rejectsLargeDimensionsBeforeDecodingPixels() throws Exception {
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(4097, 1, BufferedImage.TYPE_INT_RGB), "png", bytes);
        var file = new MockMultipartFile("file", bytes.toByteArray());
        assertThrows(ResponseStatusException.class, () -> ImageUpload.normalize(file, 1024 * 1024, 256));
    }
}
