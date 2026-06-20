import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { moderateScale, scale, verticalScale } from '../../../utils/scaling';
import type { Question } from '../config/questions';

type Props = {
  question: Question;
  selectedOption: number | null;
  onSelect: (index: number) => void;
};

export default function QuestionCard({ question, selectedOption, onSelect }: Props) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.questionText, { color: theme.text }]}>{question.text}</Text>
      <View style={styles.options}>
        {question.options.map((option, index) => {
          const isSelected = selectedOption === index;
          return (
            <Pressable
              key={index}
              onPress={() => onSelect(index)}
              style={[
                styles.optionChip,
                {
                  backgroundColor: isSelected ? theme.primary : theme.card,
                  borderColor: isSelected ? theme.primary : theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: isSelected ? '#FFFFFF' : theme.text },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: verticalScale(12),
  },
  questionText: {
    fontSize: moderateScale(18),
    fontFamily: 'Poppins_600SemiBold',
    lineHeight: moderateScale(26),
    textAlign: 'center',
    paddingHorizontal: scale(8),
  },
  options: {
    gap: verticalScale(10),
  },
  optionChip: {
    borderWidth: 1.5,
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(16),
    alignItems: 'center',
  },
  optionText: {
    fontSize: moderateScale(15),
    fontFamily: 'Poppins_500Medium',
    textAlign: 'center',
  },
});
