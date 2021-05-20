import { ChangeEvent, useState } from "react";

interface InputProps {
  value: string,
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
};

export const useLocalStorageInput = (propName: string, defaultValue: string): [string, InputProps, (value: string) => void] => {
  const [value, setValue] = useState(localStorage.getItem(propName) || defaultValue);
  const props = {
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValue(event.target.value);
      localStorage.setItem(propName, event.target.value);
    }
  }
  return [value, props, setValue];
}
