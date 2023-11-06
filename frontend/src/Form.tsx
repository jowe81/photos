import { useEffect, useState } from "react";
import "./form.css";
import axios from "axios";

function Form(props: any) {
    const { fileInfo, faceData, faceDataRecordId, baseUrl, onNextClick, onPrevClick } =
        props;

    const [names, setNames] = useState([]);

    useEffect(() => {
        if (faceData) {
            // Initialize form fields.
            setNames(
                faceData.map((item: any, index: number) => {
                    return {
                        index,
                        firstName: item.firstName ?? "",
                        lastName: item.lastName ?? "",
                        personId: item.personId,
                    };
                })
            );
        }
    }, [faceData]);

    const handleNameChange = (event: any) => {
        const { fieldName, index, personId } = event.target.dataset;
        const newNames: any = [...names];
        console.log(`Updating field ${fieldName}`);
        const oldData = names[index];

        const newData = (typeof oldData === "object") ? { ...oldData } : {};

        console.log(newData);
        newNames[index] = {
            ...newData,
            index,
            // firstName: oldData.firstName,
            // lastName: oldData.lastName,
            [fieldName]: event.target.value,
            personId,
        };
        console.log('After add', newNames[index])
        setNames(newNames);
    };

    const handleSubmit = (event: any) => {
        event.preventDefault();

        const requestBody = {
            faceDataRecordId,
            namesInfo: [...names],
        };

        console.log("Requestbody", requestBody);
        axios
            .post(`${baseUrl}db/faceData`, requestBody)
            .then(data => {
                console.log('Got back', data.data);
            })
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
                                        data-person-id={nameInfo.personId}
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
                                        data-person-id={nameInfo.personId}
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
