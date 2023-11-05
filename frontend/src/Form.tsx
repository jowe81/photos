function Form(props: any) {
    const { record, onNextClick, onPrevClick } = props;

    return <div>
        <div>
            <button onClick={onPrevClick}>Previous</button>
            <button onClick={onNextClick}>Next</button>
        </div>

    </div>
}

export default Form;