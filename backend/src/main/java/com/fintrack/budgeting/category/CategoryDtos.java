package com.fintrack.budgeting.category;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class CategoryDtos {

    private CategoryDtos() {
    }

    public record CategoryRequest(
            @NotBlank(message = "Вкажіть назву категорії") @Size(max = 100, message = "Назва задовга") String name,
            @NotNull(message = "Оберіть тип категорії") CategoryType type,
            Long parentId,
            @NotBlank(message = "Оберіть іконку") @Size(max = 50) String icon,
            @NotBlank @Pattern(regexp = "^#[0-9a-fA-F]{6}$", message = "Колір у форматі #RRGGBB") String color,
            Long version) {
    }

    public record CategoryDto(Long id, String name, CategoryType type, Long parentId, String icon, String color,
                              Long version) {
        public static CategoryDto from(Category category) {
            return new CategoryDto(category.getId(), category.getName(), category.getType(), category.getParentId(),
                    category.getIcon(), category.getColor(), category.getVersion());
        }
    }
}
