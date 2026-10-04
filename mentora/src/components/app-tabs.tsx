import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const Tabs: any = NativeTabs;

  return (
    <Tabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <Tabs.Trigger name="index">
        <Tabs.Trigger.Label>Home</Tabs.Trigger.Label>
        <Tabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </Tabs.Trigger>

      <Tabs.Trigger name="explore">
        <Tabs.Trigger.Label>Explore</Tabs.Trigger.Label>
        <Tabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </Tabs.Trigger>
    </Tabs>
  );
}
