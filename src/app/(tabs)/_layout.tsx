import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Image, StyleSheet, View, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.backgroundElement },
        tabBarActiveTintColor: '#ff8500',
        tabBarInactiveTintColor: '#7b2cbf',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="logo"
        options={{
          title: '',
          tabBarIcon: () => (
            <View style={styles.logoContainer}>
              <Image
                source={require('../../../assets/images/android-icon.jpeg')}
                style={styles.logoImage}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  logoContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#ff8500',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
});
