import { create } from 'zustand';

export interface CustomAlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export type CustomAlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  type: CustomAlertType;
  buttons: CustomAlertButton[];
  showAlert: (
    title: string,
    message?: string,
    buttons?: CustomAlertButton[],
    type?: CustomAlertType
  ) => void;
  hideAlert: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  visible: false,
  title: '',
  message: '',
  type: 'info',
  buttons: [],
  showAlert: (title: string, message = '', buttons = [{ text: 'OK' }], explicitType) => {
    let resolvedType: CustomAlertType = explicitType || 'info';

    if (!explicitType) {
      const lowerT = (title || '').toLowerCase();
      const lowerM = (message || '').toLowerCase();

      if (
        lowerT.includes('error') ||
        lowerT.includes('failed') ||
        lowerT.includes('unable') ||
        lowerM.includes('error') ||
        lowerM.includes('failed')
      ) {
        resolvedType = 'error';
      } else if (
        lowerT.includes('thank') ||
        lowerT.includes('success') ||
        lowerT.includes('reorder') ||
        lowerM.includes('success') ||
        lowerM.includes('submitted')
      ) {
        resolvedType = 'success';
      } else if (
        lowerT.includes('required') ||
        lowerT.includes('warning') ||
        lowerT.includes('cancel') ||
        lowerT.includes('attention')
      ) {
        resolvedType = 'warning';
      }
    }

    set({
      visible: true,
      title: title || 'Notification',
      message: message || '',
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
      type: resolvedType,
    });
  },
  hideAlert: () => set({ visible: false }),
}));

export const showCustomAlert = (
  title: string,
  message?: string,
  buttons?: CustomAlertButton[],
  type?: CustomAlertType
) => {
  useAlertStore.getState().showAlert(title, message, buttons, type);
};

