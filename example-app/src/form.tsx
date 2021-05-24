import React, { ChangeEvent, useState } from "react";

interface InputProps {
  value: string,
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
};

type OnChangeHandler = (newValue: string) => void;

export const useInput = (defaultValue: string, onChangeHandler?: OnChangeHandler): [string, InputProps, (value: string) => void] => {
  const [value, setValue] = useState(defaultValue);
  const props = {
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValue(event.target.value);
      onChangeHandler && onChangeHandler(event.target.value);
    }
  }
  return [value, props, setValue];
}

export const useLocalStorageInput = (propName: string, defaultValue: string, onChangeHandler?: OnChangeHandler): [string, InputProps, (value: string) => void] => {
  return useInput(localStorage.getItem(propName) || defaultValue, (newValue) => {
    localStorage.setItem(propName, newValue);
    onChangeHandler && onChangeHandler(newValue);
  })
}

interface SectionProps {
  title: string;
  disabled?: boolean;
}

export const Section : React.FunctionComponent<SectionProps> = props => {
  const disabled = props.disabled ? "disabled" : "";
  return <div className={`section ${disabled}`}>
    <h3>{props.title}</h3>
    {props.children}
  </div>
}
