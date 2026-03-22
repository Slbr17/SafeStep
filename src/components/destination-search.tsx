import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { Coordinate } from '@/lib/routing';

interface Suggestion {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
}

interface Props {
  onSelect: (coord: Coordinate, label: string) => void;
  onSubmit: (coord?: Coordinate) => void;
  loading: boolean;
}

export function DestinationSearch({ onSelect, onSubmit, loading }: Props) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selected || query.length < 3) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=gb`,
          { headers: { 'User-Agent': 'SafeStep/1.0' } }
        );
        const data: Suggestion[] = await res.json();
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 350); // debounce 350ms
  }, [query, selected]);

  function handleSelect(item: Suggestion) {
    const coord = { latitude: parseFloat(item.lat), longitude: parseFloat(item.lon) };
    setQuery(item.display_name.split(',').slice(0, 2).join(','));
    setSuggestions([]);
    setSelected(true);
    onSelect(coord, item.display_name);
    onSubmit(coord);
  }

  function handleChangeText(text: string) {
    setQuery(text);
    setSelected(false);
  }

  return (
    <View style={styles.wrapper}>
      <View style={[styles.searchBar, { backgroundColor: colors.background }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder="Where to?"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={handleChangeText}
          onSubmitEditing={() => onSubmit()}
          returnKeyType="search"
        />
        {searching ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <TouchableOpacity
            style={[styles.goBtn, !selected && { opacity: 0.4 }]}
            onPress={() => onSubmit()}
            disabled={loading || !selected}>
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.goBtnText}>Go</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.place_id}
          style={styles.dropdown}
          contentContainerStyle={styles.dropdownContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.suggestion, { backgroundColor: colors.backgroundElement }]}
              onPress={() => handleSelect(item)}>
              <Text style={[styles.suggestionText, { color: colors.text }]} numberOfLines={2}>
                {item.display_name}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 56,
    left: Spacing.three,
    right: Spacing.three,
    zIndex: 100,
  },
  searchBar: {
    flexDirection: 'row',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    gap: Spacing.two,
  },
  input: { flex: 1, fontSize: 16 },
  goBtn: {
    backgroundColor: '#ff8500',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  goBtnText: { color: '#fff', fontWeight: '600' },
  dropdown: {
    marginTop: 4,
    maxHeight: 260,
  },
  dropdownContent: {
    gap: 6,
  },
  suggestion: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  suggestionText: { fontSize: 14 },
});
