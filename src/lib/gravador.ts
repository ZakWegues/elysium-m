import { setAudioModeAsync, type AudioRecorder } from 'expo-audio';

/**
 * O gravador pronto para gravar (23/11). Uma gravação que não chegou a começar deixava o gravador
 * preparado, e a seguinte falhava com "has already been prepared": solta e prepara de novo. O modo
 * de áudio vai junto porque o trecho de música desliga a gravação.
 */
export async function prepararGravador(recorder: AudioRecorder): Promise<void> {
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
  try { await recorder.prepareToRecordAsync(); }
  catch {
    try { await recorder.stop(); } catch { /* não estava gravando */ }
    await recorder.prepareToRecordAsync();
  }
}

export async function comecarGravacao(recorder: AudioRecorder): Promise<void> {
  await prepararGravador(recorder);
  recorder.record();
}
