import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { Btn, C, SF, useSettings } from './ui';
import { formatYearMonth, initialYearMonth, pickerYears, wheelIndex } from '../lib/monthPicker';

type MonthPickerProps = {
  visible: boolean;
  value: string; // YYYY-MM
  onClose: () => void;
  onPick: (ym: string) => void;
};

function WheelColumn({ items, initialValue, rowHeight, format, onChange }: {
  items: number[];
  initialValue: number;
  rowHeight: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const { fs } = useSettings();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [initialOffset] = useState(() => ({ x: 0, y: items.indexOf(initialValue) * rowHeight }));
  const initializedRef = useRef(false);
  const selectedRef = useRef(initialValue);
  const [selected, setSelected] = useState(initialValue);

  function select(value: number) {
    // 同步 ref 后再通知父组件，滚动后立刻点“确定”也能提交最新值。
    selectedRef.current = value;
    setSelected(value);
    onChange(value);
  }

  function updateFromScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!initializedRef.current) return;
    const value = items[wheelIndex(event.nativeEvent.contentOffset.y, rowHeight, items.length)];
    if (value !== selectedRef.current) select(value);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={rowHeight}
        decelerationRate="fast"
        bounces={false}
        contentOffset={initialOffset}
        contentContainerStyle={{ paddingVertical: 3 * rowHeight }}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (initializedRef.current) return;
          scrollRef.current?.scrollTo({ ...initialOffset, animated: false });
          initializedRef.current = true;
        }}
        onScroll={updateFromScroll}
        onScrollEndDrag={updateFromScroll}
        onMomentumScrollEnd={updateFromScroll}
      >
        {items.map((value, index) => (
          <TouchableOpacity
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === value }}
            style={{ height: rowHeight, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => {
              select(value);
              scrollRef.current?.scrollTo({ y: index * rowHeight, animated: false });
            }}
          >
            <Text style={{ fontSize: fs(selected === value ? 17 : 15), fontWeight: selected === value ? '800' : '400', color: selected === value ? C.ink : C.slate }}>
              {format(value)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={{ position: 'absolute', top: 3 * rowHeight, left: 0, right: 0, height: rowHeight, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line }} />
    </View>
  );
}

function MonthPickerContent({ value, onClose, onPick }: Omit<MonthPickerProps, 'visible'>) {
  const { fs } = useSettings();
  const currentYear = new Date().getFullYear();
  const [initial] = useState(() => initialYearMonth(value, currentYear));
  const selectedRef = useRef({ ...initial });
  const [years] = useState(() => pickerYears(currentYear, initial.year));
  const [months] = useState(() => Array.from({ length: 12 }, (_, index) => index + 1));
  const rowHeight = Math.max(44, Math.ceil(fs(17) * 1.8));

  return (
    <View style={{ flex: 1, backgroundColor: C.mask, justifyContent: 'flex-end' }}>
      <Pressable accessibilityLabel="取消选择毕业时间" style={{ position: 'absolute', inset: 0 }} onPress={onClose} />
      <View style={{ ...SF.sheet, paddingBottom: 30, paddingTop: 14 }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.line, alignSelf: 'center', marginBottom: 10 }} />
        <Text style={{ fontSize: fs(15), fontWeight: '700', color: C.ink, textAlign: 'center', marginBottom: 8 }}>选择毕业时间（年月）</Text>
        <View style={{ height: rowHeight * 7, flexDirection: 'row', paddingHorizontal: 12 }}>
          <WheelColumn items={years} initialValue={initial.year} rowHeight={rowHeight} format={(year) => `${year} 年`} onChange={(year) => { selectedRef.current.year = year; }} />
          <WheelColumn items={months} initialValue={initial.month} rowHeight={rowHeight} format={(month) => `${String(month).padStart(2, '0')} 月`} onChange={(month) => { selectedRef.current.month = month; }} />
        </View>
        <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
          <Btn title="确定" onPress={() => {
            const { year, month } = selectedRef.current;
            onPick(formatYearMonth(year, month));
            onClose();
          }} />
        </View>
      </View>
    </View>
  );
}

/** 每次打开重新挂载草稿，取消时不会把未确认的年月带到下一次。 */
export function MonthPicker({ visible, value, onClose, onPick }: MonthPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible && <MonthPickerContent value={value} onClose={onClose} onPick={onPick} />}
    </Modal>
  );
}
