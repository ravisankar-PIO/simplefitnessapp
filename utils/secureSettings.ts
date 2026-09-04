import * as SecureStore from 'expo-secure-store';

const LLM_API_KEY = 'llm_api_key';

export const saveApiKey = async (key: string): Promise<void> => {
  await SecureStore.setItemAsync(LLM_API_KEY, key);
};

export const getApiKey = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync(LLM_API_KEY);
};

export const deleteApiKey = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(LLM_API_KEY);
};
