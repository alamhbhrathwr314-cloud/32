package com.example.apiplatform;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/v1")
public class ProfileController {
    private final DataStore store;

    public ProfileController(DataStore store) {
        this.store = store;
    }

    @GetMapping("/me")
    public Map<String, Object> me(HttpServletRequest req) {
        String email = (String) req.getAttribute("email");
        return Map.of("email", email, "credits", store.credits(email));
    }
}
