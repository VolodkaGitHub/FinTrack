package com.fintrack.budgeting.category;

import com.fintrack.budgeting.category.CategoryDtos.CategoryDto;
import com.fintrack.budgeting.category.CategoryDtos.CategoryRequest;
import com.fintrack.common.CurrentUser;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Категорії", description = "REQ-2.1")
@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService categoryService;

    @GetMapping
    public List<CategoryDto> list(@CurrentUser Long userId) {
        return categoryService.list(userId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CategoryDto create(@CurrentUser Long userId, @Valid @RequestBody CategoryRequest request) {
        return categoryService.create(userId, request);
    }

    @PutMapping("/{id}")
    public CategoryDto update(@CurrentUser Long userId, @PathVariable Long id, @Valid @RequestBody CategoryRequest request) {
        return categoryService.update(userId, id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@CurrentUser Long userId, @PathVariable Long id) {
        categoryService.delete(userId, id);
    }
}
