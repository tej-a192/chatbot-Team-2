class StrBuff {
    public static void main(String args[]) {
       
        String s1 = "Hello";
        String s2 = new String("hello");

        if(s1.equalsIgnoreCase(s2)) {
            System.out.println("True");
        }
        else {
            System.out.println("False");
        }
    }
}