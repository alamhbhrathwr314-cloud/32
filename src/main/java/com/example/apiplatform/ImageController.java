package com.example.apiplatform;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.awt.image.ConvolveOp;
import java.awt.image.Kernel;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/v1/image")
public class ImageController {
    private static final int COST = 1;
    private static final long MAX_PIXELS = 8_000_000L;
    private static final Set<String> OPS = Set.of("grayscale", "invert", "resize", "rotate", "flip", "blur");

    private final BillingService billing;

    public ImageController(BillingService billing) {
        this.billing = billing;
    }

    @PostMapping(value = "/process", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> process(@RequestParam("image") MultipartFile image,
                                     @RequestParam("op") String op,
                                     @RequestParam(value = "width", required = false) Integer width,
                                     @RequestParam(value = "height", required = false) Integer height,
                                     @RequestParam(value = "angle", required = false) Integer angle,
                                     @RequestParam(value = "amount", required = false) Integer amount,
                                     HttpServletRequest req) throws IOException {
        String email = (String) req.getAttribute("email");
        if (image.isEmpty()) return bad("image is required");
        if (!OPS.contains(op)) return bad("op must be one of: " + OPS);
        if (op.equals("resize") && (width == null || width < 1 || width > 4000
                || (height != null && (height < 1 || height > 4000)))) {
            return bad("resize needs width (1-4000), height optional");
        }
        if (op.equals("rotate") && (angle == null || !(angle == 90 || angle == 180 || angle == 270))) {
            return bad("angle must be 90, 180 or 270");
        }

        BufferedImage src;
        try {
            src = read(image.getBytes());
        } catch (IllegalArgumentException e) {
            return bad(e.getMessage());
        }

        if (!billing.charge(email, COST)) {
            return ResponseEntity.status(402).body(Map.of("error", "no credits left"));
        }
        try {
            BufferedImage out = switch (op) {
                case "grayscale" -> grayscale(src);
                case "invert" -> invert(src);
                case "resize" -> resize(src, width, height);
                case "rotate" -> rotate(src, angle);
                case "flip" -> flip(src);
                default -> blur(src, amount);
            };
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            ImageIO.write(out, "png", bos);
            return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(bos.toByteArray());
        } catch (Exception e) {
            billing.refund(email, COST);
            return ResponseEntity.status(500).body(Map.of("error", "image processing failed"));
        }
    }

    private ResponseEntity<?> bad(String msg) {
        return ResponseEntity.badRequest().body(Map.of("error", msg));
    }

    private BufferedImage read(byte[] bytes) throws IOException {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> it = ImageIO.getImageReaders(in);
            if (!it.hasNext()) throw new IllegalArgumentException("unsupported image (use png, jpg or gif)");
            ImageReader reader = it.next();
            try {
                reader.setInput(in);
                if ((long) reader.getWidth(0) * reader.getHeight(0) > MAX_PIXELS) {
                    throw new IllegalArgumentException("image too large (max 8 megapixels)");
                }
                BufferedImage src = reader.read(0);
                BufferedImage img = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_ARGB);
                Graphics2D g = img.createGraphics();
                g.drawImage(src, 0, 0, null);
                g.dispose();
                return img;
            } finally {
                reader.dispose();
            }
        }
    }

    private BufferedImage grayscale(BufferedImage img) {
        BufferedImage out = new BufferedImage(img.getWidth(), img.getHeight(), BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < img.getHeight(); y++) {
            for (int x = 0; x < img.getWidth(); x++) {
                int p = img.getRGB(x, y);
                int a = (p >>> 24) & 0xff, r = (p >> 16) & 0xff, g = (p >> 8) & 0xff, b = p & 0xff;
                int v = (int) (0.299 * r + 0.587 * g + 0.114 * b);
                out.setRGB(x, y, (a << 24) | (v << 16) | (v << 8) | v);
            }
        }
        return out;
    }

    private BufferedImage invert(BufferedImage img) {
        BufferedImage out = new BufferedImage(img.getWidth(), img.getHeight(), BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < img.getHeight(); y++) {
            for (int x = 0; x < img.getWidth(); x++) {
                int p = img.getRGB(x, y);
                out.setRGB(x, y, (p & 0xff000000) | (~p & 0x00ffffff));
            }
        }
        return out;
    }

    private BufferedImage resize(BufferedImage img, int width, Integer height) {
        int nh = height != null ? height
                : Math.max(1, Math.round((float) img.getHeight() * width / img.getWidth()));
        BufferedImage out = new BufferedImage(width, nh, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(img, 0, 0, width, nh, null);
        g.dispose();
        return out;
    }

    private BufferedImage rotate(BufferedImage img, int angle) {
        int w = img.getWidth(), h = img.getHeight();
        BufferedImage out = angle == 180
                ? new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB)
                : new BufferedImage(h, w, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int p = img.getRGB(x, y);
                switch (angle) {
                    case 90 -> out.setRGB(h - 1 - y, x, p);
                    case 180 -> out.setRGB(w - 1 - x, h - 1 - y, p);
                    default -> out.setRGB(y, w - 1 - x, p);
                }
            }
        }
        return out;
    }

    private BufferedImage flip(BufferedImage img) {
        int w = img.getWidth(), h = img.getHeight();
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                out.setRGB(w - 1 - x, y, img.getRGB(x, y));
            }
        }
        return out;
    }

    private BufferedImage blur(BufferedImage img, Integer amount) {
        int r = amount == null ? 2 : Math.max(1, Math.min(amount, 10));
        int n = 2 * r + 1;
        float[] k = new float[n * n];
        Arrays.fill(k, 1f / (n * n));
        return new ConvolveOp(new Kernel(n, n, k), ConvolveOp.EDGE_NO_OP, null).filter(img, null);
    }
                                     }
