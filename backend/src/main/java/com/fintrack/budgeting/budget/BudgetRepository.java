package com.fintrack.budgeting.budget;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface BudgetRepository extends JpaRepository<Budget, Long> {

    List<Budget> findByUserId(Long userId);

    Optional<Budget> findByIdAndUserId(Long id, Long userId);

    List<Budget> findByUserIdAndCategoryIdIn(Long userId, Collection<Long> categoryIds);

    boolean existsByUserIdAndCategoryId(Long userId, Long categoryId);

    boolean existsByCategoryId(Long categoryId);
}
