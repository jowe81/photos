import { useState, useEffect } from 'react'
import './App.css'

import Editor from './Editor';

import axios from 'axios';

function App() {  
  const [count, setCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0)
  const [record, setRecord] = useState<{}>();
  

  const baseUrl = 'http://192.168.1.199:3020/';

  const next = () => {
    let newIndex;
    if (currentIndex < count - 1) {
      newIndex = currentIndex + 1;
    } else {
      newIndex = 0;
    }

    setCurrentIndex(newIndex);
  }

  const prev = () => {
    let newIndex;
    if (currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else {
      newIndex = count - 1;
    }

    setCurrentIndex(newIndex);
  }

  useEffect(() => {
    axios
      .get(`${baseUrl}db/photo?index=${currentIndex}`)
      .then((data: any) => {
        if (data.data.success) {
          const payload = data.data.data;
          setRecord(payload.record);
          setCount(payload.count);
          console.log(`Got record:`, payload.record);  
        }
      })
      .catch(err => console.warn(`Unable to retrieve record with index ${currentIndex}`));
  }, [currentIndex]);

  const props = { 
    baseUrl,
    record: { ...record },
    onNextClick: next,
    onPrevClick: prev,

  }
  return (
    <>
      <Editor {...props}/>
      <div>{record && JSON.stringify(record)}</div>
    </>
  )
}

export default App
