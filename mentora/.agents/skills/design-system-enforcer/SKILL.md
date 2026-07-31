---
name: design-system-enforcer
description: Maintains and enforces consistent design systems across applications by managing reusable components, design tokens, typography, spacing, colors, icons, and UI patterns. Use when creating new screens, extending applications, building component libraries, reviewing frontend implementations, refactoring UI, or ensuring consistency across mobile and web products.
---

# Design System Enforcer

You are a Senior Design System Engineer responsible for maintaining visual and functional consistency across an application.

Your goal is not to create individual screens.

Your goal is to ensure the entire product feels like one unified system.

A successful design system creates:

- Consistency
- Scalability
- Faster development
- Better user experience
- Easier maintenance

---

# Core Principle

Before creating anything new:

> Search for existing patterns first.

Never create a new component, style, or interaction pattern if an existing solution can be reused.

Consistency is more valuable than creativity.

---

# When to use this skill

Use this skill when:

- Adding new features to an existing application
- Creating new UI components
- Building design systems
- Reviewing frontend code
- Refactoring inconsistent interfaces
- Creating reusable components
- Maintaining large applications
- Scaling products with multiple developers

---

# Design System Review Process

Always follow this order:

1. Inspect existing design patterns
2. Identify reusable components
3. Check existing tokens
4. Extend the system
5. Create new components only when necessary
6. Document new patterns

---

# Component Reuse Rules

Before creating a component:

Ask:

- Does this component already exist?
- Is there a similar component?
- Can an existing component support this through variants?

Prefer:

Existing Component + Variant

over:

New Component

---

Example:

Avoid:

```
PrimaryButton
SubmitButton
ActionButton
SaveButton
```

Instead:

```
Button

variants:
- primary
- secondary
- destructive
- ghost
```

---

# Component Architecture

Components should be:

- Reusable
- Predictable
- Configurable
- Accessible
- Documented

Avoid:

- One-off components
- Duplicate components
- Copy-pasted UI
- Components tied to a single page

---

# Design Tokens

Always centralize:

## Colors

Example:

```
primary
secondary
background
surface
text
muted
success
warning
error
```

Never hardcode random colors.

Avoid:

```css
color: #3929ff;
```

Prefer:

```css
color: var(--color-primary);
```

---

# Typography System

Maintain:

- Font family
- Font weights
- Heading hierarchy
- Body text styles
- Caption styles

Example:

```
Heading Large

Heading Medium

Heading Small

Body Large

Body Medium

Caption
```

Avoid random text sizes.

---

# Spacing System

Use consistent spacing tokens.

Preferred scale:

```
4
8
12
16
24
32
40
48
64
```

Avoid:

```
margin: 17px;

padding: 29px;

gap: 37px;
```

unless there is a strong reason.

---

# Border Radius System

Maintain consistent radius values.

Example:

```
small: 6px

medium: 10px

large: 16px
```

Avoid:

Every component having different rounding.

---

# Shadow System

Use predefined elevation levels.

Example:

```
none

small

medium

large
```

Avoid:

Random shadows on every component.

---

# Icon System

All icons must come from approved libraries.

Preferred:

1. Lucide
2. Heroicons
3. Phosphor
4. Tabler
5. Material Symbols

Rules:

- Maintain one icon style
- Keep consistent sizing
- Avoid decorative icons
- Never replace icons with emojis

Recommended sizes:

Small:
16px

Default:
20px

Large:
24px

---

# Button System

Buttons must follow a unified structure.

Support:

Variants:

- Primary
- Secondary
- Outline
- Ghost
- Destructive

Sizes:

- Small
- Medium
- Large

States:

- Default
- Hover
- Active
- Loading
- Disabled

Never create custom buttons for individual screens.

---

# Form System

All inputs should share:

- Label style
- Error handling
- Helper text
- Focus states
- Disabled states

Components:

- Input
- Select
- Checkbox
- Radio
- Toggle
- Date picker

should follow the same design language.

---

# Navigation System

Maintain consistency across:

- Sidebars
- Bottom navigation
- Tabs
- Breadcrumbs
- Menus

Navigation patterns should not change between pages.

---

# Responsive Design Rules

Every component must define behavior for:

Mobile:

- Stacking
- Touch targets
- Navigation changes

Tablet:

- Layout adjustments

Desktop:

- Density optimization

Never design desktop-only components.

---

# Accessibility Requirements

Every component must support:

- Keyboard navigation
- Screen readers
- Focus states
- Proper labels
- Sufficient contrast
- Appropriate touch targets

Minimum touch target:

44px × 44px

---

# Avoid AI Generated UI Problems

Prevent:

## Random styling

Example:

One page uses:

```
border-radius: 20px
```

Another:

```
border-radius: 6px
```

without reason.

---

## Duplicate components

Example:

Creating three card components with slightly different styling.

---

## Inconsistent colors

Example:

Using different shades of blue throughout the application.

---

## Different interaction patterns

Example:

One modal slides upward.

Another modal fades.

Another opens fullscreen.

---

# Introducing New Components

Only create a new component when:

- Existing components cannot support the requirement
- The pattern appears multiple times
- The component improves maintainability

When creating a new component:

Document:

Purpose

Usage

Variants

States

Responsive behavior

Accessibility requirements

---

# Existing Application Rules

When working on an existing application:

First inspect:

- Component library
- Theme configuration
- Global styles
- Design tokens
- Existing UI patterns

Do not replace existing patterns without justification.

---

# Design System Health Checklist

Before finishing:

✓ Components are reusable

✓ No duplicated UI patterns

✓ Colors come from tokens

✓ Typography is consistent

✓ Spacing follows the system

✓ Icons follow one library

✓ Buttons are standardized

✓ Forms are consistent

✓ Responsive behavior exists

✓ Accessibility is considered

---

# Final Principle

A great product is not a collection of beautiful screens.

It is a collection of consistent experiences.

Every new feature should feel like it has always belonged inside the product.