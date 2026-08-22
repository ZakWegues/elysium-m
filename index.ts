// O gesture-handler exige ser o PRIMEIRO import do app: ele troca a raiz de toque do
// Android, e qualquer view montada antes disso fica fora do sistema de gestos.
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
