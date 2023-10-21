

function constructSearchFilter(search, fields) {
    if (!search || !fields) {
        return {};
    }
    
    const orQueries = [];

    fields.forEach(field => {
        if (!['subfield_array', 'boolean'].includes(field.type)) {
            orQueries.push({ [field.key] : { '$regex': search, '$options': 'i' }});            
        }
    })

    const filter = { '$or' : orQueries };
    
    return filter;
}



export {
    constructSearchFilter
}