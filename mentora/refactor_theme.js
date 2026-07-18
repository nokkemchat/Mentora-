const fs = require('fs');
const path = require('path');

const files = [
  'src/app/(auth)/auth.tsx',
  'src/app/(auth)/board-selection.tsx',
  'src/app/(auth)/complete-profile.tsx',
  'src/app/(auth)/onboarding.tsx',
  'src/app/(auth)/role-selection.tsx',
  'src/app/(tabs)/ai-tutor.tsx',
  'src/app/(tabs)/courses.tsx',
  'src/app/(tabs)/index.tsx',
  'src/app/(tabs)/profile.tsx',
  'src/app/(tabs)/_layout.tsx',
  'src/app/course/[id].tsx',
  'src/app/quiz/[id].tsx',
];

files.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.log('File not found:', file);
    return;
  }
  let content = fs.readFileSync(fullPath, 'utf8');

  // Skip if already refactored
  if (content.includes('useThemeColors')) {
    console.log('Already refactored:', file);
    return;
  }

  const hasStyleSheet = content.includes('StyleSheet.create');

  // 1. Replace import
  let replacedImport = false;
  content = content.replace(/import\s+\{([^}]*)colors([^}]*)\}\s+from\s+['"]@\/constants\/theme['"];?/, (match, p1, p2) => {
    replacedImport = true;
    let newImports = (p1 + p2).split(',').map(s => s.trim()).filter(s => s.length > 0).join(', ');
    if (newImports.length > 0) {
      return `import { ${newImports}, useThemeColors } from '@/constants/theme';`;
    } else {
      return `import { useThemeColors } from '@/constants/theme';`;
    }
  });

  if (!replacedImport) {
    // If colors wasn't imported, maybe no theme was imported, or only typography.
    // Let's just manually add it if needed, or skip if the file doesn't use colors.
    // Actually, if it doesn't use colors, we don't need to refactor it.
    console.log('No colors import found in:', file);
    return;
  }

  // 2. Add useMemo to React import if needed
  if (hasStyleSheet && !content.includes('useMemo')) {
    if (content.includes('import React')) {
      content = content.replace(/import React(?:,\s*\{([^}]*)\})?\s+from\s+['"]react['"];?/, (match, p1) => {
        if (p1 && p1.trim().length > 0) {
          return `import React, { ${p1.trim()}, useMemo } from 'react';`;
        }
        return `import React, { useMemo } from 'react';`;
      });
    } else {
      content = `import React, { useMemo } from 'react';\n` + content;
    }
  }

  // 3. Inject hook
  const injection = hasStyleSheet 
    ? "\n  const colors = useThemeColors();\n  const styles = useMemo(() => createStyles(colors), [colors]);\n"
    : "\n  const colors = useThemeColors();\n";

  content = content.replace(/(export\s+default\s+function\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*\{)/, "$1" + injection);

  // 4. Change styles
  if (hasStyleSheet) {
    content = content.replace(/const\s+styles\s*=\s*StyleSheet\.create\(\{([\s\S]*?)\}\);/g, "const createStyles = (colors: any) => StyleSheet.create({$1});");
  }

  fs.writeFileSync(fullPath, content);
  console.log('Refactored', file);
});
