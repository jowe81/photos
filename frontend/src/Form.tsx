import { useEffect, useState } from "react";
import "./form.css";
import axios from "axios";

function Form(props: any) {
    const { fileInfo, faceData, personRecords, faceDataRecordId, baseUrl, onNextClick, onPrevClick } =
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
                    };
                })
            );
        }
    }, [faceData]);

    const handleNameChange = (event: any) => {
        const { fieldName, index, personRecordId } = event.target.dataset;
        const newNames: any = [...names];
        console.log(`Updating field ${fieldName}`);
        const oldData = names[index];

        const newData = (typeof oldData === "object") ? { ...oldData } : {};

        newNames[index] = {
            ...newData,
            index,
            [fieldName]: event.target.value,
            personRecordId,
        };
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
                        {names.map((nameInfo: any, index) => (
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
                                        value={nameInfo.lastName}
                                        onChange={handleNameChange}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    <button type="submit">Submit</button>
                </form>
            </div>
        </div>
    );
}

export default Form;
