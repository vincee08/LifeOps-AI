jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return function MockIonicons({ name }) {
    return React.createElement(Text, null, name);
  };
});
