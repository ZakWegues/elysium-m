// O gesture-handler exige ser o PRIMEIRO import do app: ele troca a raiz de toque do
// Android, e qualquer view montada antes disso fica fora do sistema de gestos.
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
// Define a tarefa de segundo plano no arranque — o TaskManager precisa achá-la quando o
// Android cria o processo só para rodá-la, sem UI. Ver src/lib/tarefaSegundoPlano.ts.
import './src/lib/tarefaSegundoPlano';
// Os widgets do Android (bloco 73): o handler também precisa existir antes do App, porque
// o Android pode acordar o processo só para redesenhar um widget.
import './src/widgets/handler';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
