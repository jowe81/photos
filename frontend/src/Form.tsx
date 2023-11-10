import { useEffect, useState } from "react";
import "./form.css";
import axios from "axios";
import PersonSelector from "./PersonSelector";

function Form(props: any) {
    const { fileInfo, faceData, personRecords, faceDataRecordId, baseUrl, onNextClick, onPrevClick, refetchImageData } =
        props;

    const [names, setNames] = useState([]);

    useEffect(() => {
        if (faceData) {
            // Initialize form fields.
            setNames(
                faceData.map((item: any, index: number) => {
                    const personRecord = personRecords.find((personRecord: any) => personRecord._id === item.personRecordId);

                    return {
                        index,
                        firstName: personRecord?.firstName ?? "",
                        lastName: personRecord?.lastName ?? "",
                        personRecordId: item.personRecordId,
                        readOnly: item.isReferenceDescriptor,
                    };
                })
            );
        } else {
            setNames([]);
        }
    }, [faceData]);

    const handleNameChange = (event: any) => {
        const { fieldName, index } = event.target.dataset;
        const newNames: any = [...names];
        console.log(`Updating field ${fieldName}`);
        const oldData = names[index];

        const newData = (typeof oldData === "object") ? { ...oldData } : {};

        let personRecordId;
        if (fieldName !== 'selectBox') {
            personRecordId = event.target.dataset.personRecordId;

            newNames[index] = {
                ...newData,
                index,
                [fieldName]: event.target.value,
                personRecordId,
            };    
        } else {
            personRecordId = event.target.value;
            const personRecord = personRecords.find((personRecord: any) => personRecord._id === personRecordId);
            console.log('looking for ', personRecordId, personRecord)
            newNames[index] = {
                ...newData,
                index,
                firstName: personRecord?.firstName,
                lastName: personRecord?.lastName,
                personRecordId,
                isReferenceDescriptor: true,
            };    
        }


        console.log(newNames)
        setNames(newNames);
    };

    const handleSubmit = (event: any) => {
        event.preventDefault();

        const requestBody = {
            faceDataRecordId,
            namesInfo: [...names],
        };

        axios
            .post(`${baseUrl}db/faceData`, requestBody)
            .then(refetchImageData)
            .catch(err => {
                console.error(err.message);
            })
    };
    
    return (
        <div>
            <div>
                <button onClick={onPrevClick}>Previous</button>
                <button onClick={onNextClick}>Next</button>
            </div>
            <div>
                <form onSubmit={handleSubmit}>
                    <div className="facetag-input-outer-container">
                        {names.map((nameInfo: any, index) => { 
                            const className = nameInfo.readOnly ? "select-disabled" : "";

                            return (
                                <div
                                    key={index}
                                    className="facetag-input-container"
                                >
                                    <div>
                                        <label htmlFor={`name${index}`}>
                                            Name {index + 1}:
                                        </label>
                                    </div>
                                    <div>
                                        <input
                                            type="text"
                                            id={`firstName${index}`}
                                            name={`firstName${index}`}
                                            data-field-name="firstName"
                                            data-person-id={nameInfo.personRecordId}
                                            data-index={index}
                                            readOnly={nameInfo.readOnly}
                                            disabled={nameInfo.readOnly}
                                            value={nameInfo.firstName}
                                            onChange={handleNameChange}
                                        />
                                    </div>
                                    <div>
                                        <input
                                            type="text"
                                            id={`lastName${index}`}
                                            name={`lastName${index}`}
                                            data-field-name="lastName"
                                            data-person-id={nameInfo.personRecordId}                                        
                                            data-index={index}
                                            readOnly={nameInfo.readOnly}
                                            disabled={nameInfo.readOnly}
                                            value={nameInfo.lastName}
                                            onChange={handleNameChange}
                                        />
                                    </div>
                                    <div>
                                        <select 
                                            className={className}
                                            data-field-name="selectBox"
                                            data-person-id={nameInfo.personRecordId}
                                            data-index={index}
                                            defaultValue={''}
                                            onChange={handleNameChange}
                                        >
                                            <option key={-1} value="" selected={!nameInfo.personRecordId}></option>
                                            {
                                                personRecords?.map((personRecord: any, index: number) => { 
                                                    return <option 
                                                            key={index}                                                            
                                                            value={personRecord._id}
                                                            disabled={nameInfo.readOnly}
                                                            selected={nameInfo.personRecordId === personRecord._id}
                                                            >
                                                                {personRecord.lastName}, {personRecord.firstName}

                                                        </option>
                                                })
                                            }
                                        </select>
                                    </div>
                                </div>)
                        })}
                    </div>
                    <button type="submit">Submit</button>
                </form>
            </div>
        </div>
    );
}

export default Form;
