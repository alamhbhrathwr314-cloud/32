package com.example.apiplatform;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;

@Component
public class ApiKeyFilter extends OncePerRequestFilter {
    private final ApiKeyService keys;
    private final DataStore store;

    public ApiKeyFilter(ApiKeyService keys, DataStore store) {
        this.keys = keys;
        this.store = store;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        return !req.getRequestURI().startsWith("/v1/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String header = req.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            error(res, 401, "missing api key");
            return;
        }
        Optional<String> email = keys.verify(header.substring(7).trim());
        if (email.isEmpty()) {
            error(res, 401, "invalid api key");
            return;
        }
        if (store.credits(email.get()) <= 0) {
            error(res, 402, "no credits left");
            return;
        }
        req.setAttribute("email", email.get());
        chain.doFilter(req, res);
    }

    private void error(HttpServletResponse res, int status, String msg) throws IOException {
        res.setStatus(status);
        res.setContentType("application/json");
        res.getWriter().write("{\"error\":\"" + msg + "\"}");
    }
    }
