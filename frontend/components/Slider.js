import { FlatList, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import React, { useState } from 'react';
import ChatFaceData from '../app/Services/ChatFaceData';
import { colors } from '@/constants/theme';

/**
 * @param {{ onSelect: (bot: any) => void }} props
 */
export default function Slider({ onSelect }) {
  const [selectedId, setSelectedId] = useState(1); // default to Noyi (id:1)

  const handleSelect = (item) => {
    setSelectedId(item.id);
    onSelect(item);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={ChatFaceData}
        horizontal
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => handleSelect(item)}
            style={[
              styles.itemContainer,
              { borderColor: item.id === selectedId ? '#fff' : 'transparent' },
            ]}
          >
            <Image
              source={{ uri: item.image }}
              style={{ width: 40, height: 40, borderRadius: 50 }}
            />
          </TouchableOpacity>
        )}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    
    padding: 10
  },
  itemContainer: {
    marginHorizontal: 10,
    borderWidth: 2,
    padding: 3,
    borderRadius: 50,
  },
});
