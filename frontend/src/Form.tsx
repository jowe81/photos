function Form(props: any) {
    const { record, onNextClick, onPrevClick } = props;

    return <div>
        <div>
            <button onClick={onNextClick}>Next</button>
            <button onClick={onPrevClick}>Previous</button>
        </div>

    </div>
}

export default Form;