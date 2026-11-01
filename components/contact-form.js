import form from "./form.js";

// "Contact form": an alias of "Form" with its fields already chosen (name, email, message), so a page can
// name it directly ("type": "contact-form"); for other fields, use "Form".
// (The only bundled component that imports another one: it is an alias, not a new component.) `alias` keeps it
// out of the palette and the "+" menu (one way to add a form), and the server treats it as "form".
export default {
  ...form,
  alias: "form",
  name: "Contact form",
  description: "The ready-made contact form: name, email and message; the same block as Form.",
  tip: "Works right away; if you want other fields (phone, date, a choice), add them to the list or start from the Form block.",
  props: {
    ...form.props,
    fields: {
      ...form.props.fields,
      default: [
        { label: "Name", type: "text", required: true, options: "" },
        { label: "Email", type: "email", required: true, options: "" },
        { label: "Message", type: "longtext", required: true, options: "" },
      ],
    },
    buttonText: { ...form.props.buttonText, default: "Send message" },
  },
  i18n: {
    ro: {
      ...form.i18n.ro,
      name: "Formular de contact",
      description: "Formularul gata făcut pentru contact: nume, email și mesaj; același bloc ca Formular.",
      tip: "Merge din prima; dacă vrei alte câmpuri (telefon, dată, o alegere), adaugă-le din listă sau pornește de la blocul Formular.",
    },
  },
};
