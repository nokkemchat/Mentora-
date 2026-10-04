import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useThemeColors, typography, spacing, borderRadius } from '@/constants/theme';

interface FormattedMessageProps {
  content: string;
  isUser?: boolean;
}

/**
 * Preprocesses text to convert LaTeX equations, chemistry formulas,
 * superscripts, subscripts, and scientific symbols into clean markdown.
 * Also removes display brackets (\[ \]) and prevents typographer issues.
 */
export function formatMathAndScienceContent(text: string): string {
  if (!text) return '';

  let formatted = text;

  // 1. Prevent markdown parser from turning question letters (c), (r), (tm) into ©, ®, ™
  formatted = formatted.replace(/\(([cC])\)/g, '(\u200E$1)');
  formatted = formatted.replace(/\(([rR])\)/g, '(\u200E$1)');
  formatted = formatted.replace(/\(([tT][mM])\)/g, '(\u200E$1)');
  formatted = formatted.replace(/©/g, '(c)');

  // 2. Unwrap LaTeX display math \[ ... \] and inline \( ... \) BEFORE other conversions
  formatted = formatted.replace(/\\\[([\s\S]*?)\\\]/g, (_, eq) => `\n${eq.trim()}\n`);
  formatted = formatted.replace(/\\\(([\s\S]*?)\\\)/g, '$1');
  formatted = formatted.replace(/\$\$([\s\S]*?)\$\$/g, (_, eq) => `\n${eq.trim()}\n`);

  // 3. Remove text formatting wrappers so inner brackets don't break formulas
  formatted = formatted.replace(/\\(text|mathrm|mathbf|textit|textbf|underline)\{([^}]+)\}/g, '$2');

  // 4. Clean LaTeX spacing commands (\quad, \qquad, \;, \!)
  formatted = formatted.replace(/\\(quad|qquad|,|;|!)\s*/g, ' ');

  // 5. Convert LaTeX fractions \frac{a}{b} -> a / b
  formatted = formatted.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 / $2');

  // 6. Convert square roots \sqrt{x} -> √(x)
  formatted = formatted.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');

  // 7. Convert common LaTeX chemical & math symbols
  const latexSymbols: [RegExp, string][] = [
    [/\\rightleftharpoons/g, '⇌'],
    [/\\leftrightharpoons/g, '⇌'],
    [/\\rightarrow/g, '→'],
    [/\\to\b/g, '→'],
    [/\\leftarrow/g, '←'],
    [/\\leftrightarrow/g, '↔'],
    [/\\Delta/g, 'Δ'],
    [/\\delta/g, 'δ'],
    [/\\theta/g, 'θ'],
    [/\\pi/g, 'π'],
    [/\\alpha/g, 'α'],
    [/\\beta/g, 'β'],
    [/\\gamma/g, 'γ'],
    [/\\lambda/g, 'λ'],
    [/\\mu/g, 'μ'],
    [/\\times/g, '×'],
    [/\\div/g, '÷'],
    [/\\pm/g, '±'],
    [/\\mp/g, '∓'],
    [/\\approx/g, '≈'],
    [/\\neq/g, '≠'],
    [/\\le(q)?\b/g, '≤'],
    [/\\ge(q)?\b/g, '≥'],
    [/\\infty/g, '∞'],
    [/\\cdot/g, '•'],
    [/\\bullet/g, '•'],
    [/\\circ/g, '°'],
    [/\\degree(s)?/g, '°']
  ];

  for (const [regex, replacement] of latexSymbols) {
    formatted = formatted.replace(regex, replacement);
  }

  // 8. Convert LaTeX superscripts and subscripts
  const supMap: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
    'i': 'ⁱ', 'n': 'ⁿ', 'o': 'ᵒ', 'r': 'ʳ', 't': 'ᵗ', 'x': 'ˣ', 'y': 'ʸ'
  };

  const subMap: Record<string, string> = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
    'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
    'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
    'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ',
    'P': 'ₚ', 'Q': 'ᵪ', 'A': 'ₐ', 'B': 'ᵦ', 'C': '꜀', 'T': 'ₜ', 'V': 'ᵥ'
  };

  formatted = formatted.replace(/\^{([^}]+)}/g, (_, match: string) => {
    return match.split('').map((c: string) => supMap[c] || c).join('');
  });

  formatted = formatted.replace(/_{([^}]+)}/g, (_, match: string) => {
    return match.split('').map((c: string) => subMap[c] || c).join('');
  });

  formatted = formatted.replace(/\^([0-9+\-x])/g, (_, match: string) => supMap[match] || `^${match}`);
  formatted = formatted.replace(/_([0-9a-zA-Z+\-])/g, (_, match: string) => subMap[match] || `_${match}`);

  // 9. Convert literal middle dots (·) and bullets (•) into standard markdown list bullets
  formatted = formatted.replace(/^[ \t]*[·•][ \t]+/gm, '- ');

  // 10. Format numbered step headings (e.g. "1. Understand the System:") into clear subheadings
  formatted = formatted.replace(/^(\d+)\.\s+([A-Z][^\n:]+:?)$/gm, '### Step $1: $2');

  // 11. Remove any remaining $ delimiters
  formatted = formatted.replace(/\$([^\$\n]+)\$/g, '$1');

  // 12. Clean up stray square brackets on their own line (from unparsed LaTeX \[ \])
  formatted = formatted.replace(/^\s*\[\s*$/gm, '');
  formatted = formatted.replace(/^\s*\]\s*$/gm, '');

  // 13. Convert HTML underline <u>...</u> into styled underline markdown placeholder
  formatted = formatted.replace(/<u>([^<]+)<\/u>/g, '**_$1_**');

  // 14. Normalize multiple spaces and extra empty lines
  formatted = formatted.replace(/[ \t]+/g, ' ');
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  return formatted.trim();
}

export const FormattedMessage: React.FC<FormattedMessageProps> = ({ content, isUser }) => {
  const colors = useThemeColors();

  const processedContent = useMemo(() => {
    return formatMathAndScienceContent(content);
  }, [content]);

  // Standardized, cohesive typography and monochrome palette
  const markdownStyles = useMemo(() => {
    if (isUser) {
      return StyleSheet.create({
        body: {
          color: '#ffffff',
          fontSize: typography.sizes.sm + 0.5,
          lineHeight: 21,
          fontFamily: 'Outfit_400Regular',
        },
        paragraph: {
          marginTop: 0,
          marginBottom: 2,
        },
        strong: {
          fontFamily: 'Outfit_600SemiBold',
          fontWeight: '600' as const,
          color: '#ffffff',
        },
        em: {
          fontStyle: 'italic' as const,
          color: '#ffffff',
        }
      });
    }

    // Unified, clean styling: standard black/charcoal text with balanced weights
    const textColor = colors.text; // Black / Deep charcoal in light mode, bright white in dark mode
    const lightGrayBg = colors.surfaceHighlight || '#F1F5F9';
    const borderColor = colors.border;

    return StyleSheet.create({
      body: {
        color: textColor,
        fontSize: typography.sizes.sm + 0.5,
        lineHeight: 22,
        fontFamily: 'Outfit_400Regular',
      },
      paragraph: {
        marginTop: 0,
        marginBottom: 6,
      },
      heading1: {
        color: textColor,
        fontSize: typography.sizes.md + 1,
        lineHeight: 24,
        fontFamily: 'Outfit_700Bold',
        fontWeight: '700' as const,
        marginTop: 10,
        marginBottom: 6,
      },
      heading2: {
        color: textColor,
        fontSize: typography.sizes.md,
        lineHeight: 22,
        fontFamily: 'Outfit_600SemiBold',
        fontWeight: '600' as const,
        marginTop: 8,
        marginBottom: 4,
      },
      heading3: {
        color: colors.primary,
        fontSize: typography.sizes.sm + 1.5,
        lineHeight: 22,
        fontFamily: 'Outfit_600SemiBold',
        fontWeight: '600' as const,
        marginTop: 10,
        marginBottom: 4,
      },
      heading4: {
        color: textColor,
        fontSize: typography.sizes.sm,
        lineHeight: 18,
        fontFamily: 'Outfit_600SemiBold',
        fontWeight: '600' as const,
        marginTop: 6,
        marginBottom: 2,
      },
      strong: {
        fontFamily: 'Outfit_600SemiBold',
        fontWeight: '600' as const,
        color: textColor,
      },
      em: {
        fontStyle: 'italic' as const,
        color: textColor,
      },
      s: {
        textDecorationLine: 'line-through' as const,
        color: colors.textSecondary,
      },
      bullet_list: {
        marginTop: 2,
        marginBottom: 6,
      },
      ordered_list: {
        marginTop: 2,
        marginBottom: 6,
      },
      list_item: {
        flexDirection: 'row' as const,
        alignItems: 'flex-start' as const,
        marginVertical: 2,
      },
      bullet_list_icon: {
        marginRight: 8,
        fontSize: 14,
        lineHeight: 22,
        color: colors.primary,
      },
      ordered_list_icon: {
        marginRight: 8,
        fontSize: 13,
        lineHeight: 22,
        color: colors.primary,
        fontWeight: '600' as const,
        fontFamily: 'Outfit_600SemiBold',
      },
      code_inline: {
        backgroundColor: lightGrayBg,
        color: colors.primary,
        fontFamily: 'Courier',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
        fontSize: typography.sizes.xs + 1,
        fontWeight: '600' as const,
      },
      code_block: {
        backgroundColor: colors.surfaceHighlight || '#F8FAFC',
        borderColor: borderColor,
        borderWidth: 1,
        borderRadius: borderRadius.md,
        padding: spacing.sm + 2,
        marginVertical: 6,
        fontFamily: 'Courier',
        fontSize: typography.sizes.xs + 1,
        color: textColor,
      },
      fence: {
        backgroundColor: colors.surfaceHighlight || '#F8FAFC',
        borderColor: borderColor,
        borderWidth: 1,
        borderRadius: borderRadius.md,
        padding: spacing.sm + 2,
        marginVertical: 6,
        fontFamily: 'Courier',
        fontSize: typography.sizes.xs + 1,
        color: textColor,
      },
      blockquote: {
        backgroundColor: `${colors.primary}0C`,
        borderLeftColor: colors.primary,
        borderLeftWidth: 3.5,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginVertical: 6,
        borderRadius: borderRadius.sm,
      },
      table: {
        borderWidth: 1,
        borderColor: borderColor,
        borderRadius: borderRadius.sm,
        marginVertical: 6,
      },
      th: {
        backgroundColor: lightGrayBg,
        paddingHorizontal: 8,
        paddingVertical: 6,
        fontWeight: 'bold' as const,
        borderBottomWidth: 1,
        borderColor: borderColor,
        color: textColor,
      },
      td: {
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderBottomWidth: 0.5,
        borderColor: borderColor,
        color: textColor,
      },
      hr: {
        backgroundColor: borderColor,
        height: 1,
        marginVertical: 8,
      }
    });
  }, [colors, isUser]);

  return (
    <Markdown style={markdownStyles as any}>
      {processedContent}
    </Markdown>
  );
};
