import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  useWindowDimensions, Platform,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useAuthStore from '../../src/store/authStore';
import { useRouter } from 'expo-router';
import { colors } from '../../src/theme';

const NAV_ITEMS = [
  { name: 'index',       title: 'Dashboard',      icon: 'home-outline',          iconActive: 'home' },
  { name: 'invoices',    title: 'Eingang',         icon: 'document-text-outline', iconActive: 'document-text' },
  { name: 'archive',     title: 'Archiv',          icon: 'archive-outline',       iconActive: 'archive' },
  { name: 'export',      title: 'Export',          icon: 'download-outline',      iconActive: 'download' },
  { name: 'email-inbox', title: 'E-Mail Eingang',  icon: 'mail-outline',          iconActive: 'mail' },
  { name: 'settings',    title: 'Einstellungen',   icon: 'settings-outline',      iconActive: 'settings' },
];

function DesktopSidebar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { user, logout } = useAuthStore();

  return (
    <View style={styles.sidebar}>
      {/* Logo */}
      <View style={styles.sidebarLogo}>
        <View style={styles.logoIcon}>
          <Ionicons name="receipt" size={20} color="#fff" />
        </View>
        <View style={styles.logoText}>
          <Text style={styles.logoTitle}>Autohaus Wilke</Text>
          <Text style={styles.logoSubtitle}>Rechnungsmanagement</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Navigation */}
      <View style={styles.navItems}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const navItem = NAV_ITEMS.find(n => n.name === route.name);

          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              style={[styles.navItem, focused && styles.navItemActive]}
            >
              <Ionicons
                name={((focused ? navItem?.iconActive : navItem?.icon) || 'ellipse-outline') as any}
                size={19}
                color={focused ? '#fff' : colors.sidebarTextMuted}
              />
              <Text style={[styles.navLabel, focused && styles.navLabelActive]}>
                {options.title || navItem?.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Benutzer */}
      <View style={styles.sidebarBottom}>
        <View style={styles.divider} />
        <View style={styles.userArea}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {(user?.name || user?.email || 'A').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.name || user?.email}
            </Text>
            <Text style={styles.userRole}>{user?.role}</Text>
          </View>
          <TouchableOpacity onPress={() => logout()} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={18} color={colors.sidebarTextMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 900;
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      tabBar={isDesktop ? (props) => <DesktopSidebar {...props} /> : undefined}
      sceneContainerStyle={{ backgroundColor: colors.bg }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6c5ce7',
        tabBarInactiveTintColor: '#4a4a6a',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e5ddd5',
          borderTopWidth: 1,
          height: 52 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        },
      }}
    >
      <Tabs.Screen name="index"       options={{ title: 'Dashboard',     tabBarIcon: ({ color, size }) => <Ionicons name="home"          size={size} color={color} /> }} />
      <Tabs.Screen name="invoices"    options={{ title: 'Eingang',        tabBarIcon: ({ color, size }) => <Ionicons name="document-text" size={size} color={color} /> }} />
      <Tabs.Screen name="archive"     options={{ title: 'Archiv',         tabBarIcon: ({ color, size }) => <Ionicons name="archive"       size={size} color={color} /> }} />
      <Tabs.Screen name="export"      options={{ title: 'Export',         tabBarIcon: ({ color, size }) => <Ionicons name="download"      size={size} color={color} /> }} />
      <Tabs.Screen name="email-inbox" options={{ title: 'E-Mail Eingang', tabBarIcon: ({ color, size }) => <Ionicons name="mail"          size={size} color={color} /> }} />
      <Tabs.Screen name="settings"    options={{ title: 'Einstellungen',  tabBarIcon: ({ color, size }) => <Ionicons name="settings"      size={size} color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 240,
    backgroundColor: colors.sidebar,
    zIndex: 100,
    paddingTop: Platform.OS === 'web' ? 0 : 44,
    flexDirection: 'column',
  },
  sidebarLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
  },
  logoIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { marginLeft: 10, flex: 1 },
  logoTitle: { color: '#ffffff', fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  logoSubtitle: { color: colors.sidebarTextMuted, fontSize: 11, marginTop: 1 },
  divider: { height: 1, backgroundColor: '#2d2060', marginHorizontal: 12, marginVertical: 6 },
  navItems: { flex: 1, paddingHorizontal: 8, paddingTop: 6 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  navItemActive: { backgroundColor: '#2d2060' },
  navLabel: { color: colors.sidebarTextMuted, marginLeft: 10, fontSize: 13.5 },
  navLabelActive: { color: '#ffffff', fontWeight: '600' },
  sidebarBottom: { paddingBottom: 16 },
  userArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  userInfo: { flex: 1, marginLeft: 8 },
  userName: { color: colors.sidebarText, fontSize: 12, fontWeight: '500' },
  userRole: { color: colors.sidebarTextMuted, fontSize: 11, textTransform: 'capitalize' },
  logoutBtn: { padding: 4 },
});
